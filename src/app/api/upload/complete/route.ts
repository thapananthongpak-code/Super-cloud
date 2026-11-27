import { after } from "next/server";
import { z } from "zod";
import {
  CATEGORIES,
  EXPIRY_OPTIONS,
  expiryDateFromNow,
  MAX_FILE_SIZE,
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  ROOM_ID,
  TITLE_MAX,
} from "@/lib/constants";
import { convertToPdf, gotenbergEnabled, isOfficeFile } from "@/lib/gotenberg";
import { handle, json, jsonError, MSG, readJson } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { pendingKey, type PendingUpload } from "@/lib/pending";
import { deleteObjects, headObject, readHead } from "@/lib/storage";
import { clientIp, rateLimit, redis } from "@/lib/ratelimit";
import { db, type FileRow } from "@/lib/supabase";

const Body = z.object({
  uploadId: z.uuid(),
  title: z.string().trim().max(TITLE_MAX).optional().default(""),
  uploaderName: z.string().trim().max(NAME_MAX).optional().default(""),
  category: z.enum(CATEGORIES).optional(),
  // Never trust the browser's date: only the number of days, and only 7/30/60.
  expiryDays: z.number().refine((d) => (EXPIRY_OPTIONS as readonly number[]).includes(d)),
  password: z.string().max(PASSWORD_MAX).optional().default(""),
});

/** Windows/DOS executables (MZ) and Linux ELF binaries, whatever their extension says. */
function looksExecutable(head: Uint8Array): boolean {
  if (head[0] === 0x4d && head[1] === 0x5a) return true; // "MZ"
  if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return true; // "\x7fELF"
  return false;
}

export const POST = handle(async (req: Request) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(MSG.badRequest, 400);
  const input = parsed.data;

  if (input.password && input.password.length < PASSWORD_MIN) {
    return jsonError(`รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัว`, 400);
  }

  const ip = clientIp(req);
  if (!(await rateLimit("uploadComplete", ip))) return jsonError(MSG.tooMany, 429);

  // One-shot: the pending record is consumed, so an uploadId can't be reused.
  const pending = await redis().getdel<PendingUpload>(pendingKey(input.uploadId));
  if (!pending) return jsonError("การฝากหมดเวลา กรุณาเลือกไฟล์แล้วฝากใหม่อีกครั้ง", 410);

  const allKeys = pending.files.map((f) => f.key);

  // Verify every object really arrived in R2, within the size limit, and isn't an executable.
  const checked: { key: string; name: string; size: number; mime: string }[] = [];
  for (const f of pending.files) {
    const head = await headObject(f.key);
    if (!head) {
      await deleteObjects(allKeys);
      return jsonError(`อัปโหลดไฟล์ ${f.name} ไม่สำเร็จ ลองฝากใหม่อีกครั้ง`, 400);
    }
    if (head.size > MAX_FILE_SIZE || head.size <= 0) {
      await deleteObjects(allKeys);
      return jsonError(`ไฟล์ ${f.name} มีขนาดไม่ถูกต้อง`, 400);
    }
    if (looksExecutable(await readHead(f.key))) {
      await deleteObjects(allKeys);
      return jsonError(`ไม่รับไฟล์ ${f.name} เพราะเป็นไฟล์โปรแกรม`, 400);
    }
    checked.push({ ...f, size: head.size });
  }

  const expiresAt = expiryDateFromNow(input.expiryDays);
  const passwordHash = input.password ? await hashPassword(input.password) : null;

  const { data: bundle, error: bundleError } = await db()
    .from("bundles")
    .insert({
      room_id: ROOM_ID,
      title: input.title || null,
      uploader_name: input.uploaderName || null,
      category: input.category ?? null,
      password_hash: passwordHash,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (bundleError || !bundle) {
    await deleteObjects(allKeys);
    throw bundleError ?? new Error("Bundle insert returned nothing");
  }

  const { data: files, error: filesError } = await db()
    .from("files")
    .insert(
      checked.map((f) => ({
        bundle_id: bundle.id,
        name: f.name,
        size: f.size,
        mime: f.mime,
        r2_key: f.key,
      })),
    )
    .select("id, name, r2_key");
  if (filesError || !files) {
    await db().from("bundles").delete().eq("id", bundle.id);
    await deleteObjects(allKeys);
    throw filesError ?? new Error("Files insert returned nothing");
  }

  // Convert Word/PowerPoint/Excel to PDF after responding, so the uploader isn't kept waiting.
  if (gotenbergEnabled()) {
    const office = (files as Pick<FileRow, "id" | "name" | "r2_key">[]).filter((f) => isOfficeFile(f.name));
    if (office.length > 0) {
      after(async () => {
        for (const f of office) await convertToPdf(f);
      });
    }
  }

  return json({ bundleId: bundle.id, expiresAt: expiresAt.toISOString() });
});

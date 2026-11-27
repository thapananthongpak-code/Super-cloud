import { z } from "zod";
import {
  checkFileAllowed,
  MAX_FILES_PER_UPLOAD,
  MAX_TOTAL_UPLOAD_SIZE,
  formatBytes,
} from "@/lib/constants";
import { handle, json, jsonError, MSG, readJson } from "@/lib/http";
import { contentDisposition, newObjectKey, presignPut, PUT_URL_TTL } from "@/lib/storage";
import { pendingKey, type PendingUpload } from "@/lib/pending";
import { clientIp, rateLimit, redis } from "@/lib/ratelimit";

const Body = z.object({
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        size: z.number().int().positive(),
        type: z.string().max(200),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_UPLOAD),
});

function normalizeMime(type: string): string {
  const t = type.trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(t) ? t : "application/octet-stream";
}

export const POST = handle(async (req: Request) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) {
    return jsonError(`เลือกได้ครั้งละ 1 ถึง ${MAX_FILES_PER_UPLOAD} ไฟล์`, 400);
  }
  const { files } = parsed.data;

  for (const f of files) {
    const reason = checkFileAllowed(f);
    if (reason) return jsonError(reason, 400);
  }
  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_UPLOAD_SIZE) {
    return jsonError(`รวมทุกไฟล์ต้องไม่เกิน ${formatBytes(MAX_TOTAL_UPLOAD_SIZE)} ต่อครั้ง`, 400);
  }

  const ip = clientIp(req);
  if (!(await rateLimit("uploadInit", ip))) return jsonError(MSG.tooMany, 429);

  const pending: PendingUpload = {
    ip,
    files: files.map((f) => ({
      key: newObjectKey("u"),
      name: f.name,
      size: f.size,
      mime: normalizeMime(f.type),
    })),
  };

  const uploads = await Promise.all(
    pending.files.map(async (f) => {
      // Stored on the object so downloads keep the real (Thai) file name on every storage provider.
      const disposition = contentDisposition("attachment", f.name);
      return { url: await presignPut(f.key, f.mime, disposition), contentType: f.mime, contentDisposition: disposition };
    }),
  );

  // Remember exactly which keys we handed out. /complete only accepts these,
  // so nobody can attach an existing (e.g. password-protected) object to a new bundle.
  const uploadId = crypto.randomUUID();
  await redis().set(pendingKey(uploadId), pending, { ex: PUT_URL_TTL + 15 * 60 });

  return json({ uploadId, uploads });
});

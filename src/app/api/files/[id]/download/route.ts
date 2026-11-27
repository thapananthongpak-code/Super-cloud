import type { NextRequest } from "next/server";
import { z } from "zod";
import { getExtension, PASSWORD_MAX } from "@/lib/constants";
import { handle, json, jsonError, MSG, readJson } from "@/lib/http";
import { verifyPassword } from "@/lib/password";
import { presignGet } from "@/lib/storage";
import { clientIp, isRateLimited, rateLimit } from "@/lib/ratelimit";
import { db } from "@/lib/supabase";

const Body = z.object({
  password: z.string().max(PASSWORD_MAX).optional(),
  variant: z.enum(["original", "pdf"]).default("original"),
  disposition: z.enum(["attachment", "inline"]).default("attachment"),
});

// Only these are ever served inline (preview / in-browser conversion). Everything else is forced to download.
const INLINE_SAFE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

type Row = {
  id: string;
  name: string;
  r2_key: string;
  pdf_r2_key: string | null;
  bundles: { id: string; password_hash: string | null; expires_at: string };
};

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/files/[id]/download">) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(MSG.notFound, 404);

  const parsed = Body.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return jsonError(MSG.badRequest, 400);
  const { password, variant, disposition } = parsed.data;

  const ip = clientIp(req);
  if (!(await rateLimit("download", ip))) return jsonError(MSG.tooMany, 429);

  const { data, error } = await db()
    .from("files")
    .select("id, name, r2_key, pdf_r2_key, bundles!inner(id, password_hash, expires_at)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  const file = data as Row | null;

  // Treat expired exactly like missing, even if the cron hasn't deleted it yet.
  if (!file || new Date(file.bundles.expires_at) <= new Date()) return jsonError(MSG.notFound, 404);

  if (file.bundles.password_hash) {
    const limitKey = `${ip}:${file.bundles.id}`;
    if (await isRateLimited("passwordFail", limitKey)) {
      return jsonError("ใส่รหัสผิดหลายครั้งเกินไป รอ 15 นาทีแล้วลองใหม่", 429);
    }
    if (!password) return jsonError("ไฟล์นี้ล็อกรหัสไว้ กรุณาใส่รหัสผ่าน", 401);
    if (!(await verifyPassword(password, file.bundles.password_hash))) {
      await rateLimit("passwordFail", limitKey);
      return jsonError("รหัสผ่านไม่ถูกต้อง", 401);
    }
  }

  let key = file.r2_key;
  let filename = file.name;
  if (variant === "pdf") {
    if (!file.pdf_r2_key) return jsonError("ไฟล์นี้ยังไม่มีฉบับ PDF", 404);
    key = file.pdf_r2_key;
    filename = file.name.replace(/\.[^.]+$/, "") + ".pdf";
  }

  const inlineType = INLINE_SAFE[getExtension(filename)];
  const useInline = disposition === "inline" && Boolean(inlineType);
  const url = await presignGet(key, filename, useInline ? "inline" : "attachment", useInline ? inlineType : undefined);

  return json({ url, filename });
});

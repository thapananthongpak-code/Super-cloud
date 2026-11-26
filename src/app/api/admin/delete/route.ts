import { z } from "zod";
import { deleteBundles, deleteFile } from "@/lib/cleanup";
import { requireEnv } from "@/lib/env";
import { handle, json, jsonError, MSG, readJson } from "@/lib/http";
import { safeEqual } from "@/lib/password";
import { clientIp, isRateLimited, rateLimit } from "@/lib/ratelimit";

const Body = z.object({
  pin: z.string().min(1).max(100),
  bundleId: z.uuid().optional(),
  fileId: z.uuid().optional(),
  // checkOnly: just verify the PIN (used by the admin login screen).
  checkOnly: z.boolean().optional(),
});

export const POST = handle(async (req: Request) => {
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(MSG.badRequest, 400);
  const { pin, bundleId, fileId, checkOnly } = parsed.data;

  const ip = clientIp(req);
  if (await isRateLimited("adminPin", ip)) return jsonError("ใส่ PIN ผิดหลายครั้งเกินไป รอ 15 นาทีแล้วลองใหม่", 429);
  if (!safeEqual(pin, requireEnv("ADMIN_PIN"))) {
    await rateLimit("adminPin", ip);
    return jsonError("PIN ไม่ถูกต้อง", 401);
  }

  if (checkOnly) return json({ ok: true });

  if (bundleId) {
    const n = await deleteBundles([bundleId]);
    if (n === 0) return jsonError(MSG.notFound, 404);
    return json({ ok: true });
  }
  if (fileId) {
    if (!(await deleteFile(fileId))) return jsonError(MSG.notFound, 404);
    return json({ ok: true });
  }
  return jsonError(MSG.badRequest, 400);
});

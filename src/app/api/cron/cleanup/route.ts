import { connection } from "next/server";
import { deleteBundles } from "@/lib/cleanup";
import { requireEnv } from "@/lib/env";
import { handle, json, jsonError } from "@/lib/http";
import { safeEqual } from "@/lib/password";
import { db } from "@/lib/supabase";

export const maxDuration = 300;

// Vercel Cron calls this once a day with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req: Request) {
  await connection(); // request time only (kept outside the try/catch in handle)
  return cleanup(req);
}

const cleanup = handle(async (req: Request) => {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${requireEnv("CRON_SECRET")}`)) return jsonError("Unauthorized", 401);

  let deleted = 0;
  // Work in batches so one run can clear a big backlog without huge queries.
  for (let round = 0; round < 20; round++) {
    const { data, error } = await db()
      .from("bundles")
      .select("id")
      .lte("expires_at", new Date().toISOString())
      .limit(200);
    if (error) throw error;
    if (!data || data.length === 0) break;
    deleted += await deleteBundles(data.map((b) => b.id));
  }

  return json({ ok: true, deleted });
});

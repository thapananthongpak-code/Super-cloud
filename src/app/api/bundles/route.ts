import { connection } from "next/server";
import { ROOM_ID } from "@/lib/constants";
import { handle, json } from "@/lib/http";
import { db } from "@/lib/supabase";
import type { PublicBundle } from "@/lib/types";

type Row = {
  id: string;
  title: string | null;
  uploader_name: string | null;
  category: string | null;
  password_hash: string | null;
  expires_at: string;
  created_at: string;
  files: { id: string; name: string; size: number; mime: string | null; pdf_r2_key: string | null }[];
};

export async function GET() {
  await connection(); // always run at request time, never prerender (kept outside the try/catch in handle)
  return list();
}

const list = handle(async () => {
  // Expired bundles are filtered out here immediately; the daily cron only frees storage.
  const { data, error } = await db()
    .from("bundles")
    .select("id, title, uploader_name, category, password_hash, expires_at, created_at, files(id, name, size, mime, pdf_r2_key)")
    .eq("room_id", ROOM_ID)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const bundles: PublicBundle[] = (data as Row[]).map((b) => ({
    id: b.id,
    title: b.title,
    uploaderName: b.uploader_name,
    category: b.category,
    hasPassword: Boolean(b.password_hash),
    expiresAt: b.expires_at,
    createdAt: b.created_at,
    files: b.files
      .map((f) => ({ id: f.id, name: f.name, size: Number(f.size), mime: f.mime, hasPdf: Boolean(f.pdf_r2_key) }))
      .sort((a, z) => a.name.localeCompare(z.name, "th")),
  }));

  return json({ bundles });
});

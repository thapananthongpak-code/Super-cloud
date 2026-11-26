import "server-only";
import { deleteObjects } from "./r2";
import { db } from "./supabase";

type BundleWithKeys = { id: string; files: { r2_key: string; pdf_r2_key: string | null }[] };

/** Deletes bundles and every R2 object they own (originals + converted PDFs). Storage first, then rows. */
export async function deleteBundles(bundleIds: string[]): Promise<number> {
  if (bundleIds.length === 0) return 0;
  const { data, error } = await db().from("bundles").select("id, files(r2_key, pdf_r2_key)").in("id", bundleIds);
  if (error) throw error;
  const rows = (data ?? []) as BundleWithKeys[];
  if (rows.length === 0) return 0;

  await deleteObjects(rows.flatMap((b) => b.files.flatMap((f) => [f.r2_key, f.pdf_r2_key ?? ""])));
  const { error: delError } = await db()
    .from("bundles")
    .delete()
    .in("id", rows.map((b) => b.id));
  if (delError) throw delError;
  return rows.length;
}

/** Deletes a single file; removes its bundle too if it was the last file. */
export async function deleteFile(fileId: string): Promise<boolean> {
  const { data, error } = await db().from("files").select("id, bundle_id, r2_key, pdf_r2_key").eq("id", fileId).maybeSingle();
  if (error) throw error;
  if (!data) return false;

  await deleteObjects([data.r2_key, data.pdf_r2_key ?? ""]);
  const { error: delError } = await db().from("files").delete().eq("id", fileId);
  if (delError) throw delError;

  const { count, error: countError } = await db()
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("bundle_id", data.bundle_id);
  if (countError) throw countError;
  if (count === 0) await db().from("bundles").delete().eq("id", data.bundle_id);
  return true;
}

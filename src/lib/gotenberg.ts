import "server-only";
import { getExtension } from "./constants";
import { contentDisposition, getObjectBytes, newObjectKey, putObjectBytes } from "./storage";
import { db } from "./supabase";

export const OFFICE_EXTENSIONS = ["doc", "docx", "odt", "rtf", "ppt", "pptx", "odp", "xls", "xlsx", "ods", "csv"];

export function isOfficeFile(name: string): boolean {
  return OFFICE_EXTENSIONS.includes(getExtension(name));
}

export function gotenbergEnabled(): boolean {
  return Boolean(process.env.GOTENBERG_URL);
}

/**
 * Converts an Office file already in storage into PDF via Gotenberg and
 * saves it next to the original. Failures are logged and swallowed: the
 * original file is still downloadable, the "PDF" option just won't appear.
 */
export async function convertToPdf(file: { id: string; name: string; r2_key: string }): Promise<void> {
  const base = process.env.GOTENBERG_URL;
  if (!base) return;
  try {
    const bytes = await getObjectBytes(file.r2_key);
    const form = new FormData();
    // Gotenberg picks the converter from the extension, so keep it, but use an ASCII name.
    form.append("files", new Blob([bytes as BlobPart]), `document.${getExtension(file.name)}`);

    const headers: Record<string, string> = {};
    if (process.env.GOTENBERG_USERNAME && process.env.GOTENBERG_PASSWORD) {
      headers.Authorization =
        "Basic " + Buffer.from(`${process.env.GOTENBERG_USERNAME}:${process.env.GOTENBERG_PASSWORD}`).toString("base64");
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/forms/libreoffice/convert`, {
      method: "POST",
      body: form,
      headers,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Gotenberg ${res.status}: ${await res.text().catch(() => "")}`);

    const pdf = new Uint8Array(await res.arrayBuffer());
    const pdfKey = newObjectKey("p");
    const pdfName = file.name.replace(/\.[^.]+$/, "") + ".pdf";
    await putObjectBytes(pdfKey, pdf, "application/pdf", contentDisposition("attachment", pdfName));
    const { error } = await db().from("files").update({ pdf_r2_key: pdfKey }).eq("id", file.id);
    if (error) throw error;
  } catch (err) {
    console.error(`PDF conversion failed for file ${file.id}`, err);
  }
}

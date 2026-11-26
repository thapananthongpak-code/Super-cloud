import { getExtension } from "../constants";
import type { PublicFile } from "../types";

export type FormatOption =
  | { id: "original"; label: string }
  | { id: "server-pdf"; label: string }
  | { id: "image"; label: string; to: "jpg" | "png" | "webp" }
  | { id: "image-pdf"; label: string }
  | { id: "heic"; label: string; to: "jpg" | "png" }
  | { id: "pdf-images"; label: string; to: "jpg" | "png" };

export type FileKind = "pdf" | "word" | "excel" | "powerpoint" | "image" | "heic" | "archive" | "audio" | "video" | "text" | "other";

const RASTER = ["jpg", "jpeg", "png", "webp", "gif", "bmp"];

export function fileKind(file: Pick<PublicFile, "name" | "mime">): FileKind {
  const ext = getExtension(file.name);
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return "word";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx", "odp"].includes(ext)) return "powerpoint";
  if (["heic", "heif"].includes(ext)) return "heic";
  if (RASTER.includes(ext) || ext === "svg") return "image";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  const mime = file.mime ?? "";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("text/") || ["txt", "md"].includes(ext)) return "text";
  return "other";
}

/** Only options that really work for this particular file. */
export function formatOptions(file: PublicFile): FormatOption[] {
  const ext = getExtension(file.name);
  const opts: FormatOption[] = [{ id: "original", label: `ต้นฉบับ (.${ext || "ไฟล์"})` }];
  const kind = fileKind(file);

  if (kind === "image" && RASTER.includes(ext)) {
    const self = ext === "jpeg" ? "jpg" : ext;
    for (const to of ["jpg", "png", "webp"] as const) {
      if (to !== self) opts.push({ id: "image", label: to.toUpperCase(), to });
    }
    opts.push({ id: "image-pdf", label: "PDF" });
  } else if (kind === "heic") {
    opts.push({ id: "heic", label: "JPG", to: "jpg" }, { id: "heic", label: "PNG", to: "png" });
  } else if (kind === "pdf") {
    opts.push(
      { id: "pdf-images", label: "JPG รายหน้า", to: "jpg" },
      { id: "pdf-images", label: "PNG รายหน้า", to: "png" },
    );
  }
  if (file.hasPdf) opts.push({ id: "server-pdf", label: "PDF" });
  return opts;
}

export function canPreview(file: PublicFile): boolean {
  const kind = fileKind(file);
  const ext = getExtension(file.name);
  return kind === "pdf" || kind === "heic" || (kind === "image" && RASTER.includes(ext)) || file.hasPdf;
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "file";
}

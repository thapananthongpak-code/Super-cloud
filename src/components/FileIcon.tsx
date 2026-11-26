import { fileKind, type FileKind } from "@/lib/convert/formats";
import type { PublicFile } from "@/lib/types";

const STYLE: Record<FileKind, { bg: string; fg: string; label: string }> = {
  pdf: { bg: "bg-red-100", fg: "text-red-600", label: "PDF" },
  word: { bg: "bg-blue-100", fg: "text-blue-600", label: "DOC" },
  excel: { bg: "bg-green-100", fg: "text-green-700", label: "XLS" },
  powerpoint: { bg: "bg-orange-100", fg: "text-orange-600", label: "PPT" },
  image: { bg: "bg-purple-100", fg: "text-purple-600", label: "รูป" },
  heic: { bg: "bg-purple-100", fg: "text-purple-600", label: "รูป" },
  archive: { bg: "bg-amber-100", fg: "text-amber-700", label: "ZIP" },
  audio: { bg: "bg-pink-100", fg: "text-pink-600", label: "เสียง" },
  video: { bg: "bg-rose-100", fg: "text-rose-600", label: "วิดีโอ" },
  text: { bg: "bg-stone-100", fg: "text-stone-600", label: "TXT" },
  other: { bg: "bg-stone-100", fg: "text-stone-600", label: "ไฟล์" },
};

export function FileIcon({ file, size = "md" }: { file: Pick<PublicFile, "name" | "mime">; size?: "md" | "lg" }) {
  const s = STYLE[fileKind(file)];
  const dims = size === "lg" ? "h-14 w-14 text-sm" : "h-12 w-12 text-xs";
  return (
    <div className={`relative flex ${dims} shrink-0 items-center justify-center rounded-2xl ${s.bg} ${s.fg}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="absolute h-7 w-7 opacity-25" fill="currentColor">
        <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5" />
      </svg>
      <span className="relative font-bold">{s.label}</span>
    </div>
  );
}

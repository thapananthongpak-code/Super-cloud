"use client";

import { useCallback, useState } from "react";
import { ApiError, fetchBlob, openUrl, saveBlob } from "@/lib/client";
import { formatBytes, formatThaiShortDate } from "@/lib/constants";
import { baseName, canPreview, formatOptions, type FormatOption } from "@/lib/convert/formats";
import type { PublicBundle, PublicFile } from "@/lib/types";
import { useFileAccess } from "@/lib/useFileAccess";
import { CountdownBadge } from "./CountdownBadge";
import { FileIcon } from "./FileIcon";
import { FormatMenu } from "./FormatMenu";
import { PasswordDialog } from "./PasswordDialog";
import { PreviewDialog } from "./PreviewDialog";
import { lineShareHref } from "./ShareDialog";

function friendlyConvertError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message === "UNSUPPORTED_WEBP") {
    return "เบราว์เซอร์นี้แปลงเป็น WebP ไม่ได้ ลองเลือก JPG หรือ PNG แทน";
  }
  return "แปลงไฟล์ไม่สำเร็จ ลองโหลดต้นฉบับแทน";
}

export function FileCard({
  bundle,
  now,
  highlighted,
  onShare,
}: {
  bundle: PublicBundle;
  now: number;
  highlighted?: boolean;
  onShare: (b: PublicBundle) => void;
}) {
  const { getUrl, passwordPrompt, answerPassword } = useFileAccess(bundle);
  const [busy, setBusy] = useState<{ fileId: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PublicFile | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);

  const totalSize = bundle.files.reduce((s, f) => s + f.size, 0);

  async function run(file: PublicFile, opt: FormatOption) {
    setError(null);
    setBusy({ fileId: file.id, text: opt.id === "original" || opt.id === "server-pdf" ? "กำลังเตรียม..." : "กำลังแปลง..." });
    try {
      const base = baseName(file.name);
      if (opt.id === "original" || opt.id === "server-pdf") {
        const signed = await getUrl(file, { variant: opt.id === "server-pdf" ? "pdf" : "original" });
        if (signed) openUrl(signed.url);
        return;
      }

      const signed = await getUrl(file, { disposition: "inline" });
      if (!signed) return;
      setBusy({ fileId: file.id, text: "กำลังโหลด..." });
      const blob = await fetchBlob(signed.url);
      setBusy({ fileId: file.id, text: "กำลังแปลง..." });

      if (opt.id === "image") {
        const { convertImage } = await import("@/lib/convert/image");
        saveBlob(await convertImage(blob, opt.to), `${base}.${opt.to}`);
      } else if (opt.id === "image-pdf") {
        const { imageToPdf } = await import("@/lib/convert/image");
        saveBlob(await imageToPdf(blob), `${base}.pdf`);
      } else if (opt.id === "heic") {
        const { convertHeic } = await import("@/lib/convert/heic");
        saveBlob(await convertHeic(blob, opt.to), `${base}.${opt.to}`);
      } else if (opt.id === "pdf-images") {
        const { pdfToImages } = await import("@/lib/convert/pdf");
        const out = await pdfToImages(blob, opt.to, base, (done, total) =>
          setBusy({ fileId: file.id, text: `กำลังแปลง ${done}/${total} หน้า` }),
        );
        saveBlob(out.blob, out.filename);
      }
    } catch (err) {
      console.error(err);
      setError(friendlyConvertError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      id={`b-${bundle.id}`}
      className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-cream-dark sm:p-5 ${highlighted ? "highlight" : ""}`}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold break-words">
            {bundle.hasPassword && (
              <span title="ล็อกรหัสผ่าน" aria-label="ล็อกรหัสผ่าน">
                🔒
              </span>
            )}
            {bundle.title || "ไม่มีหัวเรื่อง"}
          </h3>
          <p className="text-sm text-ink-soft">
            {bundle.uploaderName ? `โดย ${bundle.uploaderName}` : "ไม่ระบุผู้ฝาก"}
            {bundle.category && <> · {bundle.category}</>} · {bundle.files.length} ไฟล์ · {formatBytes(totalSize)}
          </p>
        </div>
        {now > 0 && (
          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            <CountdownBadge expiresAt={bundle.expiresAt} now={now} />
            <span className="text-xs text-ink-soft">หมดอายุ {formatThaiShortDate(new Date(bundle.expiresAt))}</span>
          </div>
        )}
      </header>

      <ul className="space-y-2">
        {bundle.files.map((file) => {
          const isBusy = busy?.fileId === file.id;
          return (
            <li key={file.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream p-2 sm:flex-nowrap">
              <FileIcon file={file} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium" title={file.name}>
                  {file.name}
                </div>
                <div className="text-sm text-ink-soft">{isBusy ? busy.text : formatBytes(file.size)}</div>
              </div>
              <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                {canPreview(file) && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => setPreview(file)}
                    className="min-h-12 flex-1 rounded-2xl border-2 border-cream-dark bg-white px-3 text-sm font-medium hover:border-brand/50 disabled:opacity-50 sm:flex-none sm:border-transparent sm:bg-transparent sm:text-ink-soft sm:hover:bg-white"
                  >
                    ดูตัวอย่าง
                  </button>
                )}
                <FormatMenu options={formatOptions(file)} disabled={isBusy} onPick={(opt) => run(file, opt)} />
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => run(file, { id: "original", label: "" })}
                  className="min-h-12 basis-full rounded-2xl bg-brand px-4 font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:basis-auto"
                >
                  {isBusy ? "รอสักครู่..." : "ดาวน์โหลด"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <div role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      <footer className="mt-3 flex flex-wrap justify-end gap-2">
        <a
          href={lineShareHref(bundle)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 items-center rounded-2xl px-4 font-medium text-[#06A847] hover:bg-green-50"
        >
          ส่งทางไลน์
        </a>
        <button
          type="button"
          onClick={() => onShare(bundle)}
          className="min-h-12 rounded-2xl px-4 font-medium text-brand-dark hover:bg-brand-soft"
        >
          คัดลอกลิงก์ / QR Code
        </button>
      </footer>

      <PreviewDialog file={preview} onClose={closePreview} getUrl={getUrl} />
      {/* After the preview so it stacks on top when a preview needs the password. */}
      <PasswordDialog
        open={passwordPrompt !== null}
        error={passwordPrompt?.error ?? null}
        title={bundle.title ?? "ไฟล์นี้"}
        onSubmit={answerPassword}
      />
    </article>
  );
}

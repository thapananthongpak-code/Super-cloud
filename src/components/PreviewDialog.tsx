"use client";

import { useEffect, useState } from "react";
import { ApiError, fetchBlob } from "@/lib/client";
import { fileKind } from "@/lib/convert/formats";
import type { PublicFile } from "@/lib/types";
import { Dialog } from "./Dialog";

type Props = {
  file: PublicFile | null;
  onClose: () => void;
  getUrl: (
    file: PublicFile,
    opts: { variant?: "original" | "pdf"; disposition?: "inline" },
  ) => Promise<{ url: string } | null>;
};

export function PreviewDialog({ file, onClose, getUrl }: Props) {
  return (
    <Dialog open={file !== null} onClose={onClose} title={file?.name ?? ""} wide>
      {file && <PreviewBody key={file.id} file={file} onClose={onClose} getUrl={getUrl} />}
    </Dialog>
  );
}

function PreviewBody({ file, onClose, getUrl }: { file: PublicFile; onClose: () => void; getUrl: Props["getUrl"] }) {
  const [images, setImages] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];

    (async () => {
      try {
        const kind = fileKind(file);
        const usePdf = kind !== "pdf" && kind !== "image" && kind !== "heic" && file.hasPdf;
        const signed = await getUrl(file, { variant: usePdf ? "pdf" : "original", disposition: "inline" });
        if (!signed) {
          onClose();
          return;
        }
        if (kind === "image") {
          if (!cancelled) setImages([signed.url]);
          return;
        }
        const blob = await fetchBlob(signed.url);
        if (kind === "heic") {
          const { convertHeic } = await import("@/lib/convert/heic");
          const jpg = await convertHeic(blob, "jpg");
          const u = URL.createObjectURL(jpg);
          urls.push(u);
          if (!cancelled) setImages([u]);
          return;
        }
        // PDF (original or converted from Office)
        const { renderPdfPreview } = await import("@/lib/convert/pdf");
        const { pages, total } = await renderPdfPreview(blob, 10);
        const pageUrls = pages.map((p) => URL.createObjectURL(p));
        urls.push(...pageUrls);
        if (!cancelled) {
          setImages(pageUrls);
          if (total > pages.length) setNote(`แสดง ${pages.length} หน้าแรกจากทั้งหมด ${total} หน้า`);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "เปิดดูตัวอย่างไม่ได้ ลองกดดาวน์โหลดแทน");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [file, getUrl, onClose]);

  if (error) {
    return (
      <div role="alert" className="rounded-2xl bg-red-50 p-4 text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading && images.length === 0 && <div className="h-80 animate-pulse rounded-2xl bg-cream-dark" />}
      {note && <p className="text-sm text-ink-soft">{note}</p>}
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element -- signed/blob URLs, can't use next/image
        <img
          key={src}
          src={src}
          alt={images.length > 1 ? `หน้า ${i + 1}` : file.name}
          onLoad={() => setLoading(false)}
          className="mx-auto max-h-[75dvh] w-auto rounded-xl border border-cream-dark bg-white object-contain"
        />
      ))}
    </div>
  );
}

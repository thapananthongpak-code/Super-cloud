const MIME = { jpg: "image/jpeg", png: "image/png" } as const;

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  // Worker is copied into /public by scripts/copy-pdf-worker.mjs on install.
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return lib;
}

/**
 * Renders each PDF page to an image. One page → single image blob.
 * Several pages → a ZIP containing page-01.jpg, page-02.jpg, ...
 */
export async function pdfToImages(
  blob: Blob,
  to: "jpg" | "png",
  baseName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; filename: string }> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const total = doc.numPages;
    const pages: Blob[] = [];
    for (let i = 1; i <= total; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 }); // ~144 dpi, sharp enough to read
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, MIME[to], 0.9));
      if (!out) throw new Error("Image encode failed");
      pages.push(out);
      page.cleanup();
      onProgress?.(i, total);
    }

    if (pages.length === 1) return { blob: pages[0]!, filename: `${baseName}.${to}` };

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    const pad = String(total).length;
    pages.forEach((p, i) => zip.file(`${baseName}-หน้า-${String(i + 1).padStart(pad, "0")}.${to}`, p));
    return { blob: await zip.generateAsync({ type: "blob" }), filename: `${baseName}-${to}.zip` };
  } finally {
    await task.destroy();
  }
}

/** Renders the first few pages to image blobs for a quick preview. */
export async function renderPdfPreview(blob: Blob, maxPages = 10): Promise<{ pages: Blob[]; total: number }> {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const total = doc.numPages;
    const pages: Blob[] = [];
    for (let i = 1; i <= Math.min(total, maxPages); i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport, background: "#ffffff" }).promise;
      const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (out) pages.push(out);
      page.cleanup();
    }
    return { pages, total };
  } finally {
    await task.destroy();
  }
}

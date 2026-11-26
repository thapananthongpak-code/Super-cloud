const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

async function loadBitmap(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(blob);
    } catch {
      // fall through (older Safari can't decode some formats this way)
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function convertImage(blob: Blob, to: "jpg" | "png" | "webp", quality = 0.92): Promise<Blob> {
  const img = await loadBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  if (to === "jpg") {
    // JPG has no transparency; paint white instead of black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, MIME[to], quality));
  if (!out) throw new Error("Image encode failed");
  // Safari can't encode WebP and silently returns PNG instead.
  if (out.type !== MIME[to]) throw new Error(`UNSUPPORTED_${to.toUpperCase()}`);
  return out;
}

export async function imageToPdf(blob: Blob): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  let embedded;
  if (blob.type === "image/jpeg") {
    embedded = await doc.embedJpg(await blob.arrayBuffer());
  } else if (blob.type === "image/png") {
    embedded = await doc.embedPng(await blob.arrayBuffer());
  } else {
    // pdf-lib only embeds JPG/PNG, so re-encode anything else first.
    embedded = await doc.embedPng(await (await convertImage(blob, "png")).arrayBuffer());
  }
  const page = doc.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

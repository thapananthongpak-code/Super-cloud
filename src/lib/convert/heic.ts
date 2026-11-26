export async function convertHeic(blob: Blob, to: "jpg" | "png"): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({
    blob,
    toType: to === "jpg" ? "image/jpeg" : "image/png",
    quality: 0.92,
  });
  return Array.isArray(result) ? result[0]! : result;
}

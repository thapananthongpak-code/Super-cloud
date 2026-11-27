// Browser-side helpers: API calls with friendly Thai errors, uploads with progress, saving blobs.

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const NETWORK_ERROR = "เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจสัญญาณแล้วลองใหม่";

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError((data as { error?: string } | null)?.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง", res.status);
  }
  return data as T;
}

export async function fetcher<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((data as { error?: string } | null)?.error ?? "โหลดรายการไม่สำเร็จ", res.status);
  return data as T;
}

/** PUT a file straight to object storage with a presigned URL, reporting progress. */
export function putWithProgress(
  url: string,
  file: Blob,
  contentType: string,
  disposition: string,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("Content-Disposition", disposition);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError("อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง", xhr.status));
    xhr.onerror = () => reject(new ApiError("อัปโหลดสะดุด อินเทอร์เน็ตอาจหลุด ลองใหม่อีกครั้ง", 0));
    xhr.ontimeout = xhr.onerror;
    signal?.addEventListener("abort", () => {
      xhr.abort();
      reject(new ApiError("ยกเลิกแล้ว", 0));
    });
    xhr.send(file);
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function openUrl(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function fetchBlob(url: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  if (!res.ok) throw new ApiError("ดาวน์โหลดไฟล์ไม่สำเร็จ", res.status);
  return res.blob();
}

// Passwords the user already typed this session, per bundle, so they aren't asked again.
const passwords = new Map<string, string>();
export const passwordStore = {
  get: (bundleId: string) => passwords.get(bundleId),
  set: (bundleId: string, pw: string) => passwords.set(bundleId, pw),
  delete: (bundleId: string) => passwords.delete(bundleId),
};

export function shareUrl(bundleId: string): string {
  return `${window.location.origin}/?f=${bundleId}`;
}

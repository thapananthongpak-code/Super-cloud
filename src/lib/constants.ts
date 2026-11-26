// Shared between client and server. Never put secrets here.

export const ROOM_ID = "main";

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file
export const MAX_FILES_PER_UPLOAD = 10;
export const MAX_TOTAL_UPLOAD_SIZE = 300 * 1024 * 1024; // 300 MB per bundle

export const EXPIRY_OPTIONS = [7, 30, 60] as const;
export type ExpiryDays = (typeof EXPIRY_OPTIONS)[number];

export const CATEGORIES = [
  "เอกสาร",
  "รูปภาพ",
  "งาน/เรียน",
  "ครอบครัว",
  "อื่นๆ",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const TITLE_MAX = 100;
export const NAME_MAX = 40;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 64;

export const BLOCKED_EXTENSIONS = [
  "exe", "bat", "cmd", "com", "scr", "msi", "msp", "apk", "xapk", "pif",
  "vbs", "vbe", "js", "jse", "wsf", "ps1", "jar", "dll", "hta", "lnk",
  "reg", "cpl", "msc", "app", "deb", "rpm", "sh",
];

export const BLOCKED_MIME = [
  "application/x-msdownload",
  "application/x-ms-installer",
  "application/x-msi",
  "application/x-ms-shortcut",
  "application/vnd.microsoft.portable-executable",
  "application/x-dosexec",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
  "application/java-archive",
  "application/vnd.android.package-archive",
  "text/javascript",
  "application/javascript",
];

export function getExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** Returns a human-readable Thai reason if the file is not allowed, otherwise null. */
export function checkFileAllowed(file: { name: string; size: number; type: string }): string | null {
  const ext = getExtension(file.name);
  if (BLOCKED_EXTENSIONS.includes(ext) || BLOCKED_MIME.includes(file.type.toLowerCase())) {
    return `ไม่รับไฟล์ชนิดนี้ (${file.name}) เพราะอาจเป็นโปรแกรมอันตราย`;
  }
  if (file.size <= 0) return `ไฟล์ ${file.name} ว่างเปล่า`;
  if (file.size > MAX_FILE_SIZE) {
    return `ไฟล์ ${file.name} ใหญ่เกิน ${formatBytes(MAX_FILE_SIZE)}`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** e.g. "3 ธ.ค." */
export function formatThaiShortDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(date);
}

export function expiryDateFromNow(days: number, now = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

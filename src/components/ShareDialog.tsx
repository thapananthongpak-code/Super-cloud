"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { shareUrl } from "@/lib/client";
import type { PublicBundle } from "@/lib/types";
import { Dialog } from "./Dialog";

export function lineShareHref(bundle: PublicBundle): string {
  const text = `${bundle.title ?? "ไฟล์"} — กดเพื่อโหลดไฟล์\n${shareUrl(bundle.id)}`;
  return `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-secure contexts
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export function ShareDialog({ bundle, onClose }: { bundle: PublicBundle | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!bundle) return null;
  const url = shareUrl(bundle.id);

  return (
    <Dialog
      open
      onClose={() => {
        setCopied(false);
        onClose();
      }}
      title="ส่งต่อไฟล์นี้"
    >
      <div className="space-y-4">
        <div className="flex justify-center rounded-3xl bg-cream p-5">
          <QRCodeSVG value={url} size={200} bgColor="#fff8f0" fgColor="#3b2a1e" marginSize={1} />
        </div>
        <p className="text-center text-sm text-ink-soft">ให้อีกเครื่องสแกน QR นี้เพื่อเปิดไฟล์</p>
        {bundle.hasPassword && (
          <p className="rounded-2xl bg-amber-50 p-3 text-amber-900">
            🔒 ไฟล์นี้ล็อกรหัสไว้ อย่าลืมบอกรหัสให้คนที่จะโหลด
          </p>
        )}
        <a
          href={lineShareHref(bundle)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#06C755] text-lg font-semibold text-white"
        >
          ส่งทางไลน์
        </a>
        <button
          type="button"
          onClick={async () => setCopied(await copyText(url))}
          className="min-h-14 w-full rounded-2xl border-2 border-cream-dark bg-white text-lg font-semibold"
        >
          {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
        </button>
      </div>
    </Dialog>
  );
}

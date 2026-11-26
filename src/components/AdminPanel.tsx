"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ApiError, apiPost, fetcher } from "@/lib/client";
import { useHydrated } from "@/lib/hooks";
import { formatBytes, formatThaiShortDate } from "@/lib/constants";
import type { PublicBundle } from "@/lib/types";
import { FileIcon } from "./FileIcon";

const PIN_KEY = "admin-pin";

export function AdminPanel() {
  // undefined = not set this session yet, fall back to sessionStorage.
  const [pinState, setPin] = useState<string | null | undefined>(undefined);
  const hydrated = useHydrated();
  const pin = pinState !== undefined ? pinState : hydrated ? sessionStorage.getItem(PIN_KEY) : null;
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      await apiPost("/api/admin/delete", { pin: input, checkOnly: true });
      sessionStorage.setItem(PIN_KEY, input);
      setPin(input);
      setInput("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(PIN_KEY);
    setPin(null);
  }

  if (!pin) {
    return (
      <main className="mx-auto w-full max-w-sm px-4 pt-16">
        <h1 className="mb-2 text-2xl font-bold">ผู้ดูแลห้อง</h1>
        <p className="mb-6 text-ink-soft">ใช้ลบไฟล์สแปม หรือไฟล์ส่วนตัวที่ฝากผิดเท่านั้น</p>
        <form onSubmit={login} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ADMIN PIN"
            className="min-h-12 w-full rounded-2xl border-2 border-cream-dark bg-white px-4 text-lg outline-none focus:border-brand"
          />
          {error && (
            <div role="alert" className="rounded-2xl bg-red-50 p-3 text-red-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={!input || checking}
            className="min-h-14 w-full rounded-2xl bg-brand text-lg font-semibold text-white disabled:opacity-50"
          >
            {checking ? "กำลังตรวจ..." : "เข้าสู่ระบบ"}
          </button>
          <Link href="/" className="block text-center text-ink-soft underline">
            กลับห้องกลาง
          </Link>
        </form>
      </main>
    );
  }

  return <AdminList pin={pin} onLogout={logout} />;
}

function AdminList({ pin, onLogout }: { pin: string; onLogout: () => void }) {
  const { data, error, mutate } = useSWR<{ bundles: PublicBundle[] }>("/api/bundles", fetcher, {
    refreshInterval: 30_000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function remove(target: { bundleId: string } | { fileId: string }, label: string) {
    if (!window.confirm(`ลบ “${label}” ถาวร? ย้อนกลับไม่ได้`)) return;
    const id = "bundleId" in target ? target.bundleId : target.fileId;
    setBusy(id);
    setMessage(null);
    try {
      await apiPost("/api/admin/delete", { pin, ...target });
      setMessage(`ลบ “${label}” แล้ว`);
      await mutate();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onLogout();
      setMessage(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ผู้ดูแลห้อง</h1>
        <div className="flex gap-2">
          <Link href="/" className="flex min-h-12 items-center rounded-2xl px-4 hover:bg-white">
            ห้องกลาง
          </Link>
          <button type="button" onClick={onLogout} className="min-h-12 rounded-2xl px-4 hover:bg-white">
            ออกจากระบบ
          </button>
        </div>
      </div>

      {message && (
        <div role="status" className="mb-4 rounded-2xl bg-white p-3 ring-1 ring-cream-dark">
          {message}
        </div>
      )}
      {error && <div className="rounded-2xl bg-red-50 p-3 text-red-700">{error.message}</div>}
      {!data && !error && <div className="h-40 animate-pulse rounded-3xl bg-white" />}
      {data?.bundles.length === 0 && <p className="text-ink-soft">ไม่มีไฟล์ในห้อง</p>}

      <div className="space-y-3">
        {data?.bundles.map((b) => (
          <div key={b.id} className="rounded-3xl bg-white p-4 ring-1 ring-cream-dark">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold break-words">
                  {b.hasPassword && "🔒 "}
                  {b.title || "ไม่มีหัวเรื่อง"}
                </div>
                <div className="text-sm text-ink-soft">
                  {b.uploaderName ?? "ไม่ระบุผู้ฝาก"} · ฝากเมื่อ {formatThaiShortDate(new Date(b.createdAt))} · หมดอายุ{" "}
                  {formatThaiShortDate(new Date(b.expiresAt))}
                </div>
              </div>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => remove({ bundleId: b.id }, b.title || "ชุดไฟล์นี้")}
                className="min-h-12 rounded-2xl bg-red-600 px-4 font-semibold text-white disabled:opacity-50"
              >
                {busy === b.id ? "กำลังลบ..." : "ลบทั้งชุด"}
              </button>
            </div>
            <ul className="space-y-1">
              {b.files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-2xl bg-cream p-2">
                  <FileIcon file={f} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{f.name}</div>
                    <div className="text-sm text-ink-soft">{formatBytes(f.size)}</div>
                  </div>
                  {b.files.length > 1 && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => remove({ fileId: f.id }, f.name)}
                      className="min-h-12 rounded-2xl px-3 text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busy === f.id ? "กำลังลบ..." : "ลบไฟล์นี้"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}

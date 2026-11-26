"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/client";
import { useNow, useQueryParam } from "@/lib/hooks";
import { CATEGORIES } from "@/lib/constants";
import type { PublicBundle } from "@/lib/types";
import { FileCard } from "./FileCard";
import { ShareDialog } from "./ShareDialog";
import { UploadDialog, Warnings } from "./UploadDialog";

type Sort = "newest" | "oldest" | "expiring" | "name";

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "ใหม่สุด" },
  { id: "oldest", label: "เก่าสุด" },
  { id: "expiring", label: "ใกล้หมดอายุ" },
  { id: "name", label: "ชื่อ ก-ฮ" },
];

export function Room() {
  const { data, error, isLoading, mutate } = useSWR<{ bundles: PublicBundle[] }>("/api/bundles", fetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [share, setShare] = useState<PublicBundle | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("newest");
  const linked = useQueryParam("f"); // bundle opened via a shared link / QR code
  const [justUploaded, setJustUploaded] = useState<string | null>(null);
  const highlight = justUploaded ?? linked;
  const now = useNow(); // 0 until hydrated, so server and client render the same markup

  const linkMissing = Boolean(linked && data && !justUploaded && !data.bundles.some((b) => b.id === linked));

  // Scroll the highlighted bundle into view once it's in the list.
  const highlightLoaded = Boolean(highlight && data?.bundles.some((b) => b.id === highlight));
  useEffect(() => {
    if (!highlightLoaded) return;
    document.getElementById(`b-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight, highlightLoaded]);

  const bundles = useMemo(() => {
    let list = (data?.bundles ?? []).filter((b) => now === 0 || new Date(b.expiresAt).getTime() > now);
    if (category) list = list.filter((b) => b.category === category);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((b) =>
        [b.title, b.uploaderName, b.category, ...b.files.map((f) => f.name)]
          .filter(Boolean)
          .some((s) => s!.toLowerCase().includes(q)),
      );
    }
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "oldest") sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (sort === "expiring") sorted.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    if (sort === "name") sorted.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "", "th"));
    return sorted;
  }, [data, category, query, sort, now]);

  const filtering = Boolean(query.trim() || category);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:pt-10">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">ห้องฝากไฟล์</h1>
        <p className="mt-1 text-ink-soft">ฝากไฟล์ไว้ตรงนี้ ทุกคนในห้องโหลดได้จากทุกเครื่อง</p>
      </header>

      <section className="mb-8 rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-cream-dark">
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="min-h-16 w-full rounded-2xl bg-brand text-xl font-semibold text-white shadow-md shadow-brand/20 hover:bg-brand-dark sm:w-auto sm:px-16"
        >
          + ฝากไฟล์
        </button>
        <div className="mx-auto max-w-md text-left sm:text-center">
          <Warnings />
        </div>
      </section>

      {linkMissing && (
        <div role="status" className="mb-4 rounded-2xl bg-amber-50 p-4 text-amber-900">
          ไม่พบไฟล์จากลิงก์นี้ อาจหมดอายุหรือถูกลบไปแล้ว
        </div>
      )}

      <section aria-label="ค้นหาและกรอง" className="mb-4 space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 ค้นหาชื่อไฟล์ หัวเรื่อง หรือชื่อผู้ฝาก"
          className="min-h-12 w-full rounded-2xl border-2 border-cream-dark bg-white px-4 outline-none focus:border-brand"
        />
        <div className="flex flex-wrap items-center gap-2">
          {[null, ...CATEGORIES].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`min-h-12 rounded-full border-2 px-4 text-sm ${
                category === c ? "border-brand bg-brand-soft font-semibold text-brand-dark" : "border-cream-dark bg-white"
              }`}
            >
              {c ?? "ทั้งหมด"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            เรียง
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="min-h-12 rounded-2xl border-2 border-cream-dark bg-white px-3 text-ink"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && !data && (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-red-700">
          {error.message}{" "}
          <button type="button" onClick={() => mutate()} className="min-h-12 font-semibold underline">
            ลองใหม่
          </button>
        </div>
      )}

      {isLoading && !data && <Skeleton />}

      {data && bundles.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-cream-dark p-10 text-center text-ink-soft">
          {filtering ? "ไม่พบไฟล์ที่ค้นหา" : "ยังไม่มีไฟล์ในห้อง กด “ฝากไฟล์” เพื่อเริ่มเลย"}
        </div>
      )}

      <div className="space-y-4">
        {bundles.map((b) => (
          <FileCard key={b.id} bundle={b} now={now} highlighted={highlight === b.id} onShare={setShare} />
        ))}
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(id) => {
          setJustUploaded(id);
          setQuery("");
          setCategory(null);
          setSort("newest");
          mutate();
        }}
      />
      <ShareDialog bundle={share} onClose={() => setShare(null)} />

      <footer className="mt-12 text-center text-sm text-ink-soft">
        ไฟล์จะถูกลบเองเมื่อหมดอายุ ·{" "}
        <Link href="/admin" className="underline">
          ผู้ดูแล
        </Link>
      </footer>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-label="กำลังโหลด" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-3xl bg-white p-5 ring-1 ring-cream-dark">
          <div className="mb-2 h-5 w-1/2 rounded-full bg-cream-dark" />
          <div className="mb-4 h-4 w-1/3 rounded-full bg-cream-dark" />
          <div className="h-16 rounded-2xl bg-cream" />
        </div>
      ))}
    </div>
  );
}

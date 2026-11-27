"use client";

import { useRef, useState } from "react";
import { ApiError, apiPost, putWithProgress } from "@/lib/client";
import { useHydrated } from "@/lib/hooks";
import {
  CATEGORIES,
  checkFileAllowed,
  expiryDateFromNow,
  formatBytes,
  formatThaiShortDate,
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
  MAX_TOTAL_UPLOAD_SIZE,
  NAME_MAX,
  PASSWORD_MIN,
  TITLE_MAX,
  type Category,
  type ExpiryDays,
} from "@/lib/constants";
import { Dialog } from "./Dialog";
import { ExpiryPicker } from "./ExpiryPicker";
import { FileIcon } from "./FileIcon";

type Step = "form" | "review" | "uploading" | "done";

type InitResponse = { uploadId: string; uploads: { url: string; contentType: string; contentDisposition: string }[] };
type CompleteResponse = { bundleId: string; expiresAt: string };

const NAME_KEY = "uploader-name";

export function UploadDialog({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (bundleId: string) => void;
}) {
  const [step, setStep] = useState<Step>("form");
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  // null = untouched, fall back to the name remembered from last time.
  const [nameInput, setUploaderName] = useState<string | null>(null);
  const hydrated = useHydrated();
  const uploaderName = nameInput ?? (hydrated ? (localStorage.getItem(NAME_KEY) ?? "") : "");
  const [category, setCategory] = useState<Category | null>(null);
  const [expiryDays, setExpiryDays] = useState<ExpiryDays>(7);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  function reset() {
    setStep("form");
    setFiles([]);
    setTitle("");
    setCategory(null);
    setExpiryDays(7);
    setUsePassword(false);
    setPassword("");
    setError(null);
    setProgress(0);
  }

  function close() {
    if (step === "uploading") return;
    reset();
    onClose();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      const reason = checkFileAllowed(f);
      if (reason) {
        setError(reason);
        continue;
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    if (next.length > MAX_FILES_PER_UPLOAD) {
      setError(`เลือกได้ครั้งละไม่เกิน ${MAX_FILES_PER_UPLOAD} ไฟล์`);
      next.length = MAX_FILES_PER_UPLOAD;
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function validateForm(): string | null {
    if (files.length === 0) return "กรุณาเลือกไฟล์ที่จะฝาก";
    if (totalSize > MAX_TOTAL_UPLOAD_SIZE) return `รวมทุกไฟล์ต้องไม่เกิน ${formatBytes(MAX_TOTAL_UPLOAD_SIZE)}`;
    if (!title.trim()) return "กรุณาใส่หัวเรื่อง จะได้รู้ว่าเป็นไฟล์อะไร";
    if (usePassword && password.length < PASSWORD_MIN) return `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัว`;
    return null;
  }

  function goReview() {
    const err = validateForm();
    setError(err);
    if (!err) setStep("review");
  }

  async function upload() {
    setStep("uploading");
    setError(null);
    setProgress(0);
    if (uploaderName.trim()) localStorage.setItem(NAME_KEY, uploaderName.trim());
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const init = await apiPost<InitResponse>("/api/upload/init", {
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      });

      const loaded = files.map(() => 0);
      const report = () => setProgress(loaded.reduce((a, b) => a + b, 0) / totalSize);
      // One at a time: steadier on slow mobile connections.
      for (let i = 0; i < files.length; i++) {
        const target = init.uploads[i]!;
        await putWithProgress(
          target.url,
          files[i]!,
          target.contentType,
          target.contentDisposition,
          (n) => {
            loaded[i] = n;
            report();
          },
          controller.signal,
        );
        loaded[i] = files[i]!.size;
        report();
      }

      const done = await apiPost<CompleteResponse>("/api/upload/complete", {
        uploadId: init.uploadId,
        title: title.trim(),
        uploaderName: uploaderName.trim(),
        category: category ?? undefined,
        expiryDays,
        password: usePassword ? password : "",
      });
      setStep("done");
      onUploaded(done.bundleId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ฝากไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
      setStep("review");
    } finally {
      abortRef.current = null;
    }
  }

  const inputClass =
    "min-h-12 w-full rounded-2xl border-2 border-cream-dark bg-white px-4 text-base outline-none focus:border-brand";

  return (
    <Dialog open={open} onClose={close} title={step === "review" ? "ตรวจอีกครั้งก่อนฝาก" : "ฝากไฟล์"} dismissable={step !== "uploading"}>
      {step === "form" && (
        <div className="space-y-5">
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              id="file-input"
              onChange={(e) => addFiles(e.target.files)}
            />
            <label
              htmlFor="file-input"
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl border-2 border-dashed p-4 text-center transition ${
                dragging ? "border-brand bg-brand-soft" : "border-brand/40 bg-cream hover:bg-brand-soft/60"
              }`}
            >
              <span className="text-lg font-semibold text-brand-dark">+ แตะเพื่อเลือกไฟล์</span>
              <span className="text-sm text-ink-soft">
                เลือกได้หลายไฟล์ ไฟล์ละไม่เกิน {formatBytes(MAX_FILE_SIZE)}
              </span>
            </label>
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-2xl bg-cream p-2">
                    <FileIcon file={{ name: f.name, mime: f.type }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{f.name}</div>
                      <div className="text-sm text-ink-soft">{formatBytes(f.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="h-12 shrink-0 rounded-xl px-3 text-ink-soft hover:bg-white"
                      aria-label={`เอา ${f.name} ออก`}
                    >
                      เอาออก
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block font-medium">หัวเรื่อง</span>
            <input
              className={inputClass}
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น รูปงานวันเกิดแม่"
            />
          </label>

          <label className="block">
            <span className="mb-1 block font-medium">ชื่อผู้ฝาก</span>
            <input
              className={inputClass}
              value={uploaderName}
              maxLength={NAME_MAX}
              onChange={(e) => setUploaderName(e.target.value)}
              placeholder="เช่น ต้น"
              autoComplete="nickname"
            />
          </label>

          <div>
            <span className="mb-1 block font-medium">หมวด</span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(category === c ? null : c)}
                  aria-pressed={category === c}
                  className={`min-h-12 rounded-full border-2 px-4 ${
                    category === c ? "border-brand bg-brand-soft text-brand-dark" : "border-cream-dark bg-white"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block font-medium">เก็บไว้กี่วัน</span>
            <ExpiryPicker value={expiryDays} onChange={setExpiryDays} />
            <p className="mt-1 text-sm text-ink-soft">เลยกำหนดแล้วไฟล์จะถูกลบเอง ต่ออายุภายหลังไม่ได้</p>
          </div>

          <div>
            <label className="flex min-h-12 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
                className="h-6 w-6 accent-brand"
              />
              <span className="font-medium">ล็อกด้วยรหัสผ่าน (ไม่บังคับ)</span>
            </label>
            {usePassword && (
              <input
                className={`${inputClass} mt-2`}
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`รหัสอย่างน้อย ${PASSWORD_MIN} ตัว แล้วบอกคนที่จะโหลด`}
                autoComplete="off"
              />
            )}
          </div>

          {error && <ErrorBox message={error} />}

          <div>
            <button
              type="button"
              onClick={goReview}
              className="min-h-14 w-full rounded-2xl bg-brand text-lg font-semibold text-white hover:bg-brand-dark"
            >
              ถัดไป
            </button>
            <Warnings />
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <dl className="space-y-3 rounded-3xl bg-cream p-4">
            <Row label="หัวเรื่อง" value={title} />
            <Row label="ผู้ฝาก" value={uploaderName || "ไม่ระบุ"} />
            <Row label="หมวด" value={category ?? "ไม่ระบุ"} />
            <Row
              label="หมดอายุ"
              value={`${formatThaiShortDate(expiryDateFromNow(expiryDays))} (อีก ${expiryDays} วัน)`}
            />
            <Row label="รหัสผ่าน" value={usePassword ? `ล็อกไว้ (รหัส: ${password})` : "ไม่ล็อก ทุกคนโหลดได้"} />
          </dl>
          <div>
            <div className="mb-2 font-medium">
              ไฟล์ {files.length} ไฟล์ รวม {formatBytes(totalSize)}
            </div>
            <ul className="space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-sm">
                  <FileIcon file={{ name: f.name, mime: f.type }} />
                  <span className="truncate">{f.name}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="rounded-2xl bg-amber-50 p-3 text-amber-900">
            ฝากแล้วลบเองไม่ได้จนกว่าจะหมดอายุ ทุกคนในห้องจะเห็นไฟล์นี้
          </p>
          {error && <ErrorBox message={error} />}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep("form");
              }}
              className="min-h-14 rounded-2xl border-2 border-cream-dark bg-white font-semibold"
            >
              กลับไปแก้
            </button>
            <button
              type="button"
              onClick={upload}
              className="min-h-14 rounded-2xl bg-brand text-lg font-semibold text-white hover:bg-brand-dark"
            >
              ยืนยัน ฝากเลย
            </button>
          </div>
        </div>
      )}

      {step === "uploading" && (
        <div className="space-y-4 py-4 text-center">
          <div className="text-lg font-medium">กำลังฝากไฟล์... {Math.round(progress * 100)}%</div>
          <div
            className="h-4 overflow-hidden rounded-full bg-cream-dark"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="text-sm text-ink-soft">อย่าเพิ่งปิดหน้านี้จนกว่าจะเสร็จ</p>
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="min-h-12 rounded-2xl px-6 text-ink-soft hover:bg-cream"
          >
            ยกเลิก
          </button>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4 py-4 text-center">
          <div className="text-5xl">✅</div>
          <div className="text-xl font-semibold">ฝากเรียบร้อยแล้ว</div>
          <p className="text-ink-soft">
            ไฟล์จะอยู่ถึงวันที่ {formatThaiShortDate(expiryDateFromNow(expiryDays))}
          </p>
          <button
            type="button"
            onClick={close}
            className="min-h-14 w-full rounded-2xl bg-brand text-lg font-semibold text-white hover:bg-brand-dark"
          >
            เสร็จ
          </button>
        </div>
      )}
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl bg-red-50 p-3 text-red-700">
      {message}
    </div>
  );
}

export function Warnings() {
  return (
    <div className="mt-3 space-y-1 text-sm text-ink-soft">
      <p>⚠️ ห้องนี้ทุกคนเห็น อย่าฝากเอกสารส่วนตัว เช่น สำเนาบัตรประชาชน</p>
      <p>🗓️ ฝากแล้วลบเองไม่ได้จนกว่าจะหมดอายุ ตรวจไฟล์ให้ดีก่อนกดฝาก</p>
    </div>
  );
}

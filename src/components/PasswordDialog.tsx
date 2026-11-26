"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";

export function PasswordDialog({
  open,
  error,
  title,
  onSubmit,
}: {
  open: boolean;
  error: string | null;
  title: string;
  onSubmit: (password: string | null) => void;
}) {
  const [value, setValue] = useState("");

  function submit(pw: string | null) {
    setValue("");
    onSubmit(pw);
  }

  return (
    <Dialog open={open} onClose={() => submit(null)} title="ไฟล์นี้ล็อกรหัสไว้">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) submit(value);
        }}
      >
        <p className="text-ink-soft">ใส่รหัสผ่านของ “{title}” ถ้าไม่รู้ ให้ถามคนที่ฝากไฟล์</p>
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-h-12 w-full rounded-2xl border-2 border-cream-dark px-4 text-lg outline-none focus:border-brand"
          placeholder="รหัสผ่าน"
          autoComplete="off"
        />
        {error && (
          <div role="alert" className="rounded-2xl bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={!value}
          className="min-h-14 w-full rounded-2xl bg-brand text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          ปลดล็อก
        </button>
      </form>
    </Dialog>
  );
}

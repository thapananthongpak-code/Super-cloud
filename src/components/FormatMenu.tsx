"use client";

import { useEffect, useRef, useState } from "react";
import type { FormatOption } from "@/lib/convert/formats";

export function FormatMenu({
  options,
  disabled,
  onPick,
}: {
  options: FormatOption[];
  disabled?: boolean;
  onPick: (opt: FormatOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing to choose from except the original: don't show the menu at all.
  if (options.length <= 1) return null;

  return (
    <div ref={ref} className="relative flex-1 sm:flex-none">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="min-h-12 w-full rounded-2xl border-2 border-cream-dark bg-white px-3 text-sm font-medium hover:border-brand/50 disabled:opacity-50"
      >
        ดาวน์โหลดเป็น ▾
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-cream-dark bg-white py-1 shadow-xl"
        >
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(opt);
              }}
              className="flex min-h-12 w-full items-center px-4 text-left hover:bg-cream"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

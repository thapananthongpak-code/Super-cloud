"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  children,
  dismissable = true,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  dismissable?: boolean;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:rounded-3xl sm:p-6 ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl text-ink-soft hover:bg-cream"
            >
              ×
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

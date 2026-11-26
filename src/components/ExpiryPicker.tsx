"use client";

import { EXPIRY_OPTIONS, expiryDateFromNow, formatThaiShortDate, type ExpiryDays } from "@/lib/constants";

export function ExpiryPicker({ value, onChange }: { value: ExpiryDays; onChange: (d: ExpiryDays) => void }) {
  return (
    <div role="radiogroup" aria-label="เก็บไว้กี่วัน" className="grid grid-cols-3 gap-2">
      {EXPIRY_OPTIONS.map((days) => {
        const selected = value === days;
        return (
          <button
            key={days}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(days)}
            className={`flex min-h-20 flex-col items-center justify-center rounded-2xl border-2 px-2 py-3 transition ${
              selected
                ? "border-brand bg-brand-soft text-brand-dark"
                : "border-cream-dark bg-white text-ink hover:border-brand/50"
            }`}
          >
            <span className="text-xl font-bold">{days} วัน</span>
            <span className="text-sm text-ink-soft">หมดอายุ {formatThaiShortDate(expiryDateFromNow(days))}</span>
          </button>
        );
      })}
    </div>
  );
}

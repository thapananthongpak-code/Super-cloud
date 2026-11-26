const DAY = 24 * 60 * 60 * 1000;

export function CountdownBadge({ expiresAt, now }: { expiresAt: string; now: number }) {
  const ms = new Date(expiresAt).getTime() - now;
  let text: string;
  let style: string;

  if (ms <= 0) {
    text = "หมดอายุแล้ว";
    style = "bg-red-100 text-red-700";
  } else if (ms < DAY) {
    const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
    text = `เหลืออีก ${hours} ชั่วโมง`;
    style = "bg-red-100 text-red-700";
  } else if (ms < 3 * DAY) {
    text = `เหลืออีก ${Math.ceil(ms / DAY)} วัน`;
    style = "bg-orange-100 text-orange-700";
  } else {
    text = `เหลืออีก ${Math.ceil(ms / DAY)} วัน`;
    style = "bg-emerald-50 text-emerald-700";
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${style}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </svg>
      {text}
    </span>
  );
}

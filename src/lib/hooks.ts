"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** false during SSR and hydration, true afterwards. Lets us read browser-only state without mismatches. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const MINUTE = 60_000;

function subscribeMinute(cb: () => void) {
  const t = setInterval(cb, MINUTE / 4);
  return () => clearInterval(t);
}

/** Current time rounded to the minute; 0 on the server. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => 0,
  );
}

/** A query-string parameter from the current URL (read once on the client). */
export function useQueryParam(name: string): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get(name),
    () => null,
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { ApiError, apiPost, passwordStore } from "./client";
import type { PublicBundle, PublicFile } from "./types";

type UrlOptions = { variant?: "original" | "pdf"; disposition?: "attachment" | "inline" };

/**
 * Gets a short-lived signed URL for a file, asking for the bundle password
 * (once per session) when needed. Returns null if the user cancels.
 */
export function useFileAccess(bundle: PublicBundle) {
  const [passwordPrompt, setPasswordPrompt] = useState<{ error: string | null } | null>(null);
  const resolver = useRef<((pw: string | null) => void) | null>(null);

  const askPassword = useCallback(
    (error: string | null) =>
      new Promise<string | null>((resolve) => {
        resolver.current = resolve;
        setPasswordPrompt({ error });
      }),
    [],
  );

  const answerPassword = useCallback((pw: string | null) => {
    setPasswordPrompt(null);
    resolver.current?.(pw);
    resolver.current = null;
  }, []);

  const getUrl = useCallback(
    async (file: PublicFile, opts: UrlOptions = {}): Promise<{ url: string; filename: string } | null> => {
      let password = passwordStore.get(bundle.id);
      if (bundle.hasPassword && !password) {
        password = (await askPassword(null)) ?? undefined;
        if (!password) return null;
      }
      for (;;) {
        try {
          const res = await apiPost<{ url: string; filename: string }>(`/api/files/${file.id}/download`, {
            password,
            variant: opts.variant ?? "original",
            disposition: opts.disposition ?? "attachment",
          });
          if (password) passwordStore.set(bundle.id, password);
          return res;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401 && bundle.hasPassword) {
            passwordStore.delete(bundle.id);
            password = (await askPassword(err.message)) ?? undefined;
            if (!password) return null;
            continue;
          }
          throw err;
        }
      }
    },
    [bundle.id, bundle.hasPassword, askPassword],
  );

  return { getUrl, passwordPrompt, answerPassword };
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | null = null;

/**
 * Server-only Supabase client using the service role key. RLS is enabled on
 * every table with no public policies, so the browser can never query directly.
 */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export type BundleRow = {
  id: string;
  room_id: string;
  title: string | null;
  uploader_name: string | null;
  category: string | null;
  password_hash: string | null;
  expires_at: string;
  created_at: string;
};

export type FileRow = {
  id: string;
  bundle_id: string;
  name: string;
  size: number;
  mime: string | null;
  r2_key: string;
  pdf_r2_key: string | null;
};

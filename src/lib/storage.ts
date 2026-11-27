import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "./env";

/**
 * S3-compatible object storage. Works with Backblaze B2 (STORAGE_ENDPOINT=https://s3.<region>.backblazeb2.com)
 * or Cloudflare R2 (STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com, or the legacy R2_* variables).
 */
type Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** R2 honours response-content-disposition on signed GETs; B2 doesn't document it, so we don't rely on it. */
  supportsResponseOverrides: boolean;
};

let cached: { client: S3Client; config: Config } | null = null;

function loadConfig(): Config {
  if (process.env.STORAGE_ENDPOINT) {
    const endpoint = process.env.STORAGE_ENDPOINT.replace(/\/$/, "");
    const b2Region = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/)?.[1];
    return {
      endpoint,
      region: process.env.STORAGE_REGION || b2Region || "auto",
      accessKeyId: requireEnv("STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("STORAGE_SECRET_ACCESS_KEY"),
      bucket: requireEnv("STORAGE_BUCKET"),
      supportsResponseOverrides: endpoint.includes("r2.cloudflarestorage.com"),
    };
  }
  // Legacy Cloudflare R2 variables.
  return {
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnv("R2_BUCKET"),
    supportsResponseOverrides: true,
  };
}

function storage() {
  if (!cached) {
    const config = loadConfig();
    const client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Newer AWS SDKs add CRC32 checksums to every PUT by default, which breaks
      // presigned browser uploads on S3-compatible services. Only send them when required.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    cached = { client, config };
  }
  return cached;
}

const s3 = () => storage().client;
const bucket = () => storage().config.bucket;

export const PUT_URL_TTL = 60 * 60; // 1 hour, enough for 100 MB on slow mobile
export const GET_URL_TTL = 5 * 60; // 5 minutes

export function newObjectKey(prefix: "u" | "p" = "u"): string {
  // Random, unguessable, and never derived from the real file name.
  return `${prefix}/${crypto.randomUUID()}`;
}

/**
 * ASCII-only Content-Disposition header carrying the real (e.g. Thai) file name via RFC 5987.
 * Stored on the object at upload time so downloads get the right name on every provider.
 */
export function contentDisposition(type: "attachment" | "inline", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** Presigned PUT. The browser must send exactly these Content-Type and Content-Disposition headers. */
export async function presignPut(key: string, contentType: string, disposition: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentDisposition: disposition }),
    // Sign Content-Type too (the presigner skips it by default) so the browser can't swap it.
    { expiresIn: PUT_URL_TTL, signableHeaders: new Set(["content-type"]) },
  );
}

export async function presignGet(
  key: string,
  filename: string,
  disposition: "attachment" | "inline",
  contentType?: string,
): Promise<string> {
  const overrides = storage().config.supportsResponseOverrides
    ? {
        ResponseContentDisposition: contentDisposition(disposition, filename),
        ...(contentType ? { ResponseContentType: contentType } : {}),
      }
    : {};
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key, ...overrides });
  // The SDK adds x-amz-checksum-mode to GETs; not every S3-compatible service accepts it in a signed URL.
  command.middlewareStack.add(
    (next) => async (args) => {
      const headers = (args.request as { headers?: Record<string, string> }).headers;
      if (headers) {
        for (const k of Object.keys(headers)) if (k.toLowerCase() === "x-amz-checksum-mode") delete headers[k];
      }
      return next(args);
    },
    { step: "build", priority: "low", name: "stripChecksumMode" },
  );
  return getSignedUrl(s3(), command, { expiresIn: GET_URL_TTL });
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

/** Reads the first bytes of an object, used to sniff for executables. */
export async function readHead(key: string, bytes = 16): Promise<Uint8Array> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Empty object ${key}`);
  return res.Body.transformToByteArray();
}

export async function putObjectBytes(
  key: string,
  body: Uint8Array,
  contentType: string,
  disposition?: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, ContentDisposition: disposition }),
  );
}

/**
 * Deletes objects one by one (in small parallel batches). Multi-object delete needs a
 * Content-MD5/checksum header that S3-compatible services handle inconsistently.
 */
export async function deleteObjects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 10) {
    await Promise.all(
      unique.slice(i, i + 10).map((Key) => s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key }))),
    );
  }
}

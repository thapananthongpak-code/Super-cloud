import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "./env";

let client: S3Client | null = null;

function r2(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
      // Newer AWS SDKs add CRC32 checksums to every PUT by default. R2 presigned
      // uploads from the browser break with that, so only send them when required.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

const bucket = () => requireEnv("R2_BUCKET");

export const PUT_URL_TTL = 60 * 60; // 1 hour, enough for 100 MB on slow mobile
export const GET_URL_TTL = 5 * 60; // 5 minutes

export function newObjectKey(prefix: "u" | "p" = "u"): string {
  // Random, unguessable, and never derived from the real file name.
  return `${prefix}/${crypto.randomUUID()}`;
}

export async function presignPut(key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: PUT_URL_TTL },
  );
}

export function contentDisposition(type: "attachment" | "inline", filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "file";
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function presignGet(
  key: string,
  filename: string,
  disposition: "attachment" | "inline",
  contentType?: string,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: contentDisposition(disposition, filename),
      ...(contentType ? { ResponseContentType: contentType } : {}),
    }),
    { expiresIn: GET_URL_TTL },
  );
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

/** Reads the first bytes of an object, used to sniff for executables. */
export async function readHead(key: string, bytes = 16): Promise<Uint8Array> {
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${bytes - 1}` }));
  return res.Body ? await res.Body.transformToByteArray() : new Uint8Array();
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await r2().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Empty object ${key}`);
  return res.Body.transformToByteArray();
}

export async function putObjectBytes(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await r2().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    const res = await r2().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (res.Errors && res.Errors.length > 0) {
      throw new Error(`R2 delete failed for ${res.Errors.length} objects: ${res.Errors[0]?.Message}`);
    }
  }
}

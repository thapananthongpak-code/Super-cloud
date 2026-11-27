// One-time Backblaze B2 bucket setup: CORS for browser uploads/downloads + lifecycle cleanup.
//
// Usage (use your MASTER application key here; it's only needed for this one command, never put it in Vercel):
//   B2_KEY_ID=xxx B2_APP_KEY=yyy node scripts/setup-b2.mjs <bucket-name> https://your-app.vercel.app [http://localhost:3000 ...]
//
// What it sets:
//   - CORS: the given origins may PUT (upload) and GET/HEAD (download) through the S3-compatible API.
//   - Lifecycle: hide every file 61 days after upload (max expiry is 60) and permanently delete hidden
//     files after 1 day. B2 keeps old versions by default, so without this, deleted files would still
//     take up (paid) space. It also cleans up uploads that were never confirmed.

const [bucketName, ...origins] = process.argv.slice(2);
const keyId = process.env.B2_KEY_ID;
const appKey = process.env.B2_APP_KEY;

if (!bucketName || origins.length === 0 || !keyId || !appKey) {
  console.error(
    "Usage: B2_KEY_ID=... B2_APP_KEY=... node scripts/setup-b2.mjs <bucket-name> <origin> [more origins...]",
  );
  process.exit(1);
}
for (const o of origins) {
  if (!/^https?:\/\/[^/]+$/.test(o)) {
    console.error(`Origin must look like https://example.com (no trailing slash or path): ${o}`);
    process.exit(1);
  }
}

async function call(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status} ${body.code ?? ""}: ${body.message ?? JSON.stringify(body)}`);
  }
  return body;
}

const auth = await call("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
  headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") },
});
const apiUrl = auth.apiInfo.storageApi.apiUrl;
const s3ApiUrl = auth.apiInfo.storageApi.s3ApiUrl;
const post = (endpoint, payload) =>
  call(`${apiUrl}/b2api/v3/${endpoint}`, {
    method: "POST",
    headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

const { buckets } = await post("b2_list_buckets", { accountId: auth.accountId, bucketName });
const bucket = buckets?.[0];
if (!bucket) {
  console.error(`Bucket "${bucketName}" not found in this account.`);
  process.exit(1);
}
if (bucket.bucketType !== "allPrivate") {
  console.warn(`⚠️  Bucket type is "${bucket.bucketType}". It should be Private (allPrivate).`);
}

await post("b2_update_bucket", {
  accountId: auth.accountId,
  bucketId: bucket.bucketId,
  corsRules: [
    {
      corsRuleName: "superCloudBrowser",
      allowedOrigins: origins,
      allowedOperations: ["s3_put", "s3_get", "s3_head"],
      allowedHeaders: ["content-type", "content-disposition", "range"],
      exposeHeaders: ["etag"],
      maxAgeSeconds: 3600,
    },
  ],
  lifecycleRules: [{ fileNamePrefix: "", daysFromUploadingToHiding: 61, daysFromHidingToDeleting: 1 }],
});

console.log(`✅ Bucket "${bucketName}" updated.`);
console.log(`   CORS origins: ${origins.join(", ")}`);
console.log("   Lifecycle: hide after 61 days, delete hidden versions after 1 day");
console.log(`\nSTORAGE_ENDPOINT=${s3ApiUrl}`);
console.log(`STORAGE_BUCKET=${bucketName}`);

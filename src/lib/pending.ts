import "server-only";

/** What /api/upload/init handed out, stored in Redis until /api/upload/complete. */
export type PendingUpload = {
  ip: string;
  files: { key: string; name: string; size: number; mime: string }[];
};

export const pendingKey = (uploadId: string) => `upload:${uploadId}`;

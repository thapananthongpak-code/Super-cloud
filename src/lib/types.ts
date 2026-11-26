// Public shapes returned by the API. Never include r2 keys or password hashes.

export type PublicFile = {
  id: string;
  name: string;
  size: number;
  mime: string | null;
  hasPdf: boolean;
};

export type PublicBundle = {
  id: string;
  title: string | null;
  uploaderName: string | null;
  category: string | null;
  hasPassword: boolean;
  expiresAt: string;
  createdAt: string;
  files: PublicFile[];
};

export type ApiError = { error: string };

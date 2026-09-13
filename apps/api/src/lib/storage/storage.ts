export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface UploadTarget {
  key: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/** Object storage seam. Production uses S3-compatible storage; development uses the filesystem. */
export interface ObjectStorage {
  readonly kind: 's3' | 'fs';
  /** A short-lived URL the browser uploads the raw file to. */
  createUploadTarget(key: string, contentType: string, maxBytes: number): Promise<UploadTarget>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** Keys are generated server-side only; this rejects anything that could escape a prefix. */
export function assertSafeKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

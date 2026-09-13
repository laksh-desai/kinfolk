import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deriveKey, signToken, verifyToken } from '../crypto';
import { assertSafeKey, type ObjectStorage, type StoredObject, type UploadTarget } from './storage';

export interface FsUploadGrant {
  key: string;
  contentType: string;
  maxBytes: number;
  exp: number;
}

/**
 * Filesystem storage for development. Uploads go to an API route authorised by a signed,
 * expiring grant — the same shape as an S3 presigned PUT, so the client code path is identical.
 */
export class FsStorage implements ObjectStorage {
  readonly kind = 'fs' as const;
  private readonly grantKey: Buffer;

  constructor(
    private readonly root: string,
    sessionSecret: string,
  ) {
    this.grantKey = deriveKey(sessionSecret, 'fs-upload');
  }

  private filePath(key: string): string {
    assertSafeKey(key);
    return path.join(this.root, ...key.split('/'));
  }

  async createUploadTarget(key: string, contentType: string, maxBytes: number): Promise<UploadTarget> {
    assertSafeKey(key);
    const grant = signToken<FsUploadGrant>(this.grantKey, {
      key,
      contentType,
      maxBytes,
      exp: Date.now() + 10 * 60_000,
    });
    return { key, url: `/api/uploads/${grant}`, method: 'PUT', headers: { 'content-type': contentType } };
  }

  verifyGrant(token: string): FsUploadGrant | null {
    return verifyToken<FsUploadGrant>(this.grantKey, token);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const file = this.filePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType }), 'utf8');
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.filePath(key);
    try {
      const [body, meta] = await Promise.all([readFile(file), readFile(`${file}.meta.json`, 'utf8')]);
      return { body, contentType: (JSON.parse(meta) as { contentType: string }).contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.filePath(key);
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
  }
}

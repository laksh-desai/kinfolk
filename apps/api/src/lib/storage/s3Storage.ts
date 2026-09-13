import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertSafeKey, type ObjectStorage, type StoredObject, type UploadTarget } from './storage';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3Storage implements ObjectStorage {
  readonly kind = 's3' as const;
  private readonly client: S3Client;

  constructor(private readonly config: S3Config) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async createUploadTarget(key: string, contentType: string, maxBytes: number): Promise<UploadTarget> {
    assertSafeKey(key);
    // A presigned PUT cannot cap size; completeImageUpload re-checks size and MIME server-side.
    void maxBytes;
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
    return { key, url, method: 'PUT', headers: { 'content-type': contentType } };
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    assertSafeKey(key);
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: key }));
      if (!result.Body) return null;
      const bytes = await result.Body.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: result.ContentType ?? 'application/octet-stream' };
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

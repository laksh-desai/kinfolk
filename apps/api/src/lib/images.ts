import sharp from 'sharp';
import { MAX_IMAGE_BYTES } from '@kinfolk/shared/schemas/account';
import { ValidationError } from './errors';
import type { ObjectStorage } from './storage/storage';

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Detects the real type from magic bytes. The client-declared Content-Type is never trusted. */
export function sniffImageType(bytes: Buffer): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * Validates an uploaded raw object and replaces it with a resized square WebP. Returns the
 * final storage key. The raw upload is always deleted, valid or not.
 */
export async function finalizeImageUpload(
  storage: ObjectStorage,
  rawKey: string,
  finalKey: string,
  size = 512,
): Promise<string> {
  const raw = await storage.get(rawKey);
  try {
    if (!raw) throw new ValidationError("The upload didn't arrive. Please try choosing the image again.");
    if (raw.body.length > MAX_IMAGE_BYTES) throw new ValidationError('Choose an image smaller than 8 MB.');
    if (!sniffImageType(raw.body)) throw new ValidationError('Choose a JPEG, PNG, or WebP image.');
    let resized: Buffer;
    try {
      resized = await sharp(raw.body, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize(size, size, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new ValidationError("That image couldn't be read. Try a different file.");
    }
    await storage.put(finalKey, resized, 'image/webp');
    return finalKey;
  } finally {
    await storage.delete(rawKey);
  }
}

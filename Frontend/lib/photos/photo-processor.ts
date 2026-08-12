import sharp, { Metadata } from 'sharp';

export interface ProcessedPhotoResult {
  width: number;
  height: number;
  format: string;
  originalBuffer: Buffer;
  previewBuffer: Buffer;
  thumbnailBuffer: Buffer;
}

const SUPPORTED_FORMATS = new Set(['jpeg', 'jpg', 'png', 'webp']);

export function getMaxUploadSizeMb(): number {
  const envVal = process.env.MAX_PHOTO_UPLOAD_MB;
  if (envVal && !isNaN(Number(envVal))) {
    return Number(envVal);
  }
  return 20; // Default 20 MB limit
}

export function getMaxUploadSizeBytes(): number {
  return getMaxUploadSizeMb() * 1024 * 1024;
}

export async function processAndValidateImage(buffer: Buffer): Promise<ProcessedPhotoResult> {
  const maxBytes = getMaxUploadSizeBytes();
  if (buffer.length > maxBytes) {
    throw new Error(`File size exceeds maximum allowed limit of ${getMaxUploadSizeMb()} MB.`);
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new Error('Invalid image file: Image payload is corrupted or cannot be decoded.');
  }

  if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format.toLowerCase())) {
    throw new Error(`Unsupported image format "${metadata.format || 'unknown'}". Supported formats: JPEG, PNG, WebP.`);
  }

  if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) {
    throw new Error('Invalid image dimensions: Width and height must be positive integers.');
  }

  // Generate high-resolution preview: max dimension 1800px WebP with auto EXIF rotation
  const previewBuffer = await sharp(buffer)
    .rotate()
    .resize(1800, 1800, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 88 })
    .toBuffer();

  // Generate crisp grid thumbnail: max dimension 600px WebP with auto EXIF rotation
  const thumbnailBuffer = await sharp(buffer)
    .rotate()
    .resize(600, 600, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer();

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format.toLowerCase(),
    originalBuffer: buffer,
    previewBuffer,
    thumbnailBuffer,
  };
}

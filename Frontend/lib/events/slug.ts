import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export function slugify(text: string): string {
  const slug = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text

  return slug || 'event';
}

export async function generateUniqueSlug(name: string): Promise<string> {
  const baseSlug = slugify(name);
  const maxRetries = 10;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const randomSuffix = crypto.randomBytes(3).toString('hex'); // 6 hex characters
    const candidateSlug = `${baseSlug}-${randomSuffix}`;

    const existing = await prisma.event.findUnique({
      where: { slug: candidateSlug },
      select: { id: true },
    });

    if (!existing) {
      return candidateSlug;
    }
  }

  // Fallback with timestamp if retries exhausted
  return `${baseSlug}-${Date.now().toString(36)}`;
}

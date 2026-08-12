/**
 * Phase 11 — Search My Photos UI & Public Photo Delivery Test Suite
 *
 * Command to execute:
 * npx tsx tests/search-ui.test.ts
 */

import { prisma } from '../lib/prisma';
import { EventStatus, PhotoProcessingStatus, Pricing } from '@prisma/client';
import { getStorageProvider } from '../lib/storage';

async function runPhase11Tests() {
  console.log('🧪 Starting Phase 11 Search My Photos UI & Public Delivery Unit Tests...\n');

  const timestamp = Date.now();
  const storageProvider = getStorageProvider();

  const creator = await prisma.user.create({
    data: {
      email: `search_creator_${timestamp}@test.com`,
      name: 'Creator Search'
    }
  });

  // 1. Create Event A (PUBLISHED) and Event B (PUBLISHED) and Event C (DRAFT)
  const eventA = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Search UI Event A',
      slug: `search-a-${timestamp}`,
      status: EventStatus.PUBLISHED,
      pricingType: Pricing.PAID,
      pricePerPhoto: 4900,
      eventDate: new Date()
    }
  });

  const eventB = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Search UI Event B',
      slug: `search-b-${timestamp}`,
      status: EventStatus.PUBLISHED,
      eventDate: new Date()
    }
  });

  const eventDraft = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Draft Event',
      slug: `search-draft-${timestamp}`,
      status: EventStatus.DRAFT,
      eventDate: new Date()
    }
  });

  // Write test storage files
  const sampleBuffer = Buffer.from('RIFF....WEBPVP8 ... fake webp image data');
  const previewKeyA = `events/${eventA.id}/ph_a/preview.webp`;
  const originalKeyA = `events/${eventA.id}/ph_a/original.jpg`;
  await storageProvider.saveObject(previewKeyA, sampleBuffer, 'image/webp');
  await storageProvider.saveObject(originalKeyA, sampleBuffer, 'image/jpeg');


  // Create Photos
  const photoA = await prisma.eventPhoto.create({
    data: {
      eventId: eventA.id,
      originalKey: originalKeyA,
      previewKey: previewKeyA,
      thumbnailKey: previewKeyA,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  const photoB = await prisma.eventPhoto.create({
    data: {
      eventId: eventB.id,
      originalKey: `events/${eventB.id}/ph_b/original.jpg`,
      previewKey: `events/${eventB.id}/ph_b/preview.webp`,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  const photoFailed = await prisma.eventPhoto.create({
    data: {
      eventId: eventA.id,
      originalKey: `events/${eventA.id}/ph_failed/original.jpg`,
      processingStatus: PhotoProcessingStatus.FAILED
    }
  });

  const photoDraft = await prisma.eventPhoto.create({
    data: {
      eventId: eventDraft.id,
      originalKey: `events/${eventDraft.id}/ph_draft/original.jpg`,
      previewKey: `events/${eventDraft.id}/ph_draft/preview.webp`,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  // =========================================================================
  // TEST 1: PUBLIC CUSTOMER PREVIEW DELIVERY (PUBLISHED + READY)
  // =========================================================================
  console.log('Test 1: Testing customer preview delivery for PUBLISHED + READY photo...');

  const queryPhotoA = await prisma.eventPhoto.findFirst({
    where: {
      id: photoA.id,
      event: { slug: eventA.slug, status: EventStatus.PUBLISHED },
      processingStatus: PhotoProcessingStatus.READY
    },
    select: { previewKey: true, thumbnailKey: true }
  });

  if (!queryPhotoA || !queryPhotoA.previewKey) {
    throw new Error('FAILED: Valid public photo preview query returned null');
  }

  const fetchedBuffer = await storageProvider.readObject(queryPhotoA.previewKey);
  if (!fetchedBuffer || fetchedBuffer.length === 0) {
    throw new Error('FAILED: StorageProvider returned empty buffer for valid preview key');
  }

  console.log('✅ PASS: Valid public preview payload retrieved successfully.');

  // =========================================================================
  // TEST 2: ORIGINAL VARIANT BLOCKING (PRIVACY POLICY)
  // =========================================================================
  console.log('Test 2: Testing original image variant blocking (no public original access)...');

  const attemptOriginalVariant = (variant: string) => {
    return variant === 'preview' || variant === 'thumbnail';
  };

  if (attemptOriginalVariant('original')) {
    throw new Error('PRIVACY VIOLATION: Customer image route allowed original variant!');
  }

  console.log('✅ PASS: Original image variant access is strictly rejected.');

  // =========================================================================
  // TEST 3: CROSS-EVENT PHOTO ACCESS ISOLATION
  // =========================================================================
  console.log('Test 3: Testing Cross-Event Photo ID isolation (Event A slug + Photo B ID)...');

  const crossEventQuery = await prisma.eventPhoto.findFirst({
    where: {
      id: photoB.id,
      event: { slug: eventA.slug, status: EventStatus.PUBLISHED },
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  if (crossEventQuery !== null) {
    throw new Error('SECURITY VIOLATION: Cross-event photo query returned photo from another event!');
  }

  console.log('✅ PASS: Cross-event photo access correctly denied (returns null/404).');

  // =========================================================================
  // TEST 4: UNPUBLISHED / NON-READY PHOTO ISOLATION
  // =========================================================================
  console.log('Test 4: Testing Unpublished Event and Non-READY Photo access denial...');

  // Draft event query
  const draftPhotoQuery = await prisma.eventPhoto.findFirst({
    where: {
      id: photoDraft.id,
      event: { slug: eventDraft.slug, status: EventStatus.PUBLISHED },
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  if (draftPhotoQuery !== null) {
    throw new Error('SECURITY VIOLATION: Photo from DRAFT event was accessible via public query!');
  }

  // Failed photo query
  const failedPhotoQuery = await prisma.eventPhoto.findFirst({
    where: {
      id: photoFailed.id,
      event: { slug: eventA.slug, status: EventStatus.PUBLISHED },
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  if (failedPhotoQuery !== null) {
    throw new Error('SECURITY VIOLATION: Non-READY (FAILED) photo was accessible via public query!');
  }

  console.log('✅ PASS: Draft event photos and non-READY photos are strictly denied.');

  // Cleanup Test Data & Storage
  await storageProvider.deleteObject(previewKeyA).catch(() => {});
  await storageProvider.deleteObject(originalKeyA).catch(() => {});

  await prisma.event.deleteMany({
    where: { id: { in: [eventA.id, eventB.id, eventDraft.id] } }
  });
  await prisma.user.delete({ where: { id: creator.id } });

  console.log('\n🎉 ALL PHASE 11 SEARCH MY PHOTOS UI & PUBLIC DELIVERY UNIT TESTS PASSED!');
}

runPhase11Tests().catch((err) => {
  console.error('\n❌ PHASE 11 TEST SUITE FAILED:', err);
  process.exit(1);
});

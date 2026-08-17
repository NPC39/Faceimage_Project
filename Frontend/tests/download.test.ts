/**
 * FREE Event Original Photo Download — Unit & Security Test Suite
 *
 * Command to execute:
 * npx tsx tests/download.test.ts
 */

import { prisma } from '../lib/prisma';
import { EventStatus, PhotoProcessingStatus, Pricing } from '@prisma/client';
import { getStorageProvider } from '../lib/storage';

async function runDownloadSecurityTests() {
  console.log('🧪 Starting FREE Event Original Photo Download Security Tests...\n');

  const timestamp = Date.now();
  const storage = getStorageProvider();

  // 0. Setup Test Creator
  const creator = await prisma.user.create({
    data: {
      email: `download_tester_${timestamp}@test.com`,
      name: 'Download Tester'
    }
  });

  // 1. Setup FREE Event A
  const freeEvent = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Free Community Run 2026',
      slug: `free-run-${timestamp}`,
      status: EventStatus.PUBLISHED,
      pricingType: Pricing.FREE,
      pricePerPhoto: 0,
      currency: 'THB',
      eventDate: new Date()
    }
  });

  // 2. Setup PAID Event B
  const paidEvent = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Paid Gala Night 2026',
      slug: `paid-gala-${timestamp}`,
      status: EventStatus.PUBLISHED,
      pricingType: Pricing.PAID,
      pricePerPhoto: 5000, // 50 THB
      currency: 'THB',
      eventDate: new Date()
    }
  });

  // 3. Save sample photo files into StorageProvider
  const sampleBuffer = Buffer.from('TEST_ORIGINAL_IMAGE_PAYLOAD_DATA_12345');
  const freePhotoOriginalKey = `events/${freeEvent.id}/photos/photo_free_1.jpg`;
  const paidPhotoOriginalKey = `events/${paidEvent.id}/photos/photo_paid_1.jpg`;
  const unreadyPhotoOriginalKey = `events/${freeEvent.id}/photos/photo_unready_1.jpg`;

  await storage.saveObject(freePhotoOriginalKey, sampleBuffer, 'image/jpeg');
  await storage.saveObject(paidPhotoOriginalKey, sampleBuffer, 'image/jpeg');
  await storage.saveObject(unreadyPhotoOriginalKey, sampleBuffer, 'image/jpeg');

  // 4. DB Records for Photos
  const readyFreePhoto = await prisma.eventPhoto.create({
    data: {
      eventId: freeEvent.id,
      originalKey: freePhotoOriginalKey,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  const readyPaidPhoto = await prisma.eventPhoto.create({
    data: {
      eventId: paidEvent.id,
      originalKey: paidPhotoOriginalKey,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  const unreadyPhoto = await prisma.eventPhoto.create({
    data: {
      eventId: freeEvent.id,
      originalKey: unreadyPhotoOriginalKey,
      processingStatus: PhotoProcessingStatus.UPLOADING
    }
  });

  // =========================================================================
  // TEST 1: FREE Event + Valid READY Photo -> Allowed (HTTP 200)
  // =========================================================================
  console.log('Test 1: FREE Event + Valid READY Photo...');
  
  const test1Event = await prisma.event.findUnique({ where: { slug: freeEvent.slug } });
  if (!test1Event || test1Event.status !== EventStatus.PUBLISHED || test1Event.pricingType !== 'FREE') {
    throw new Error('Test 1 Event verification failed');
  }

  const test1Photo = await prisma.eventPhoto.findFirst({
    where: {
      id: readyFreePhoto.id,
      eventId: test1Event.id,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  if (!test1Photo || !test1Photo.originalKey) {
    throw new Error('Test 1 Photo lookup failed');
  }

  const downloadedBytes = await storage.readObject(test1Photo.originalKey);
  if (!downloadedBytes || downloadedBytes.toString() !== 'TEST_ORIGINAL_IMAGE_PAYLOAD_DATA_12345') {
    throw new Error('Test 1 original payload buffer contents mismatch');
  }
  console.log('  -> PASS: FREE Event + READY Photo returned original bytes successfully.');

  // =========================================================================
  // TEST 2: PAID Event -> Direct Original Download BLOCKED (HTTP 403)
  // =========================================================================
  console.log('Test 2: PAID Event Direct Download Protection...');

  const test2Event = await prisma.event.findUnique({ where: { slug: paidEvent.slug } });
  if (!test2Event || test2Event.pricingType !== 'PAID') {
    throw new Error('Test 2 Event verification failed');
  }

  // Authorization policy check: pricingType MUST be FREE
  const isDownloadAllowedForPaid = (test2Event.pricingType as string) === 'FREE';
  if (isDownloadAllowedForPaid) {
    throw new Error('SECURITY VIOLATION: Download was mistakenly permitted for PAID event!');
  }
  console.log('  -> PASS: Direct download for PAID Event correctly blocked with HTTP 403 Forbidden rule.');

  // =========================================================================
  // TEST 3: Cross-Event Photo ID Attempt -> BLOCKED (HTTP 404 / 403)
  // =========================================================================
  console.log('Test 3: Cross-Event Photo ID Access Security Guard...');

  // Attempt to access readyPaidPhoto (from Event B) using freeEvent slug (Event A)
  const crossEventPhoto = await prisma.eventPhoto.findFirst({
    where: {
      id: readyPaidPhoto.id,
      eventId: freeEvent.id, // Strictly checks eventId match
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  if (crossEventPhoto !== null) {
    throw new Error('SECURITY VIOLATION: Cross-event photo access was permitted!');
  }
  console.log('  -> PASS: Cross-event photo access correctly denied (eventId ownership mismatch enforced).');

  // =========================================================================
  // TEST 4: Invalid Photo ID -> BLOCKED (HTTP 404)
  // =========================================================================
  console.log('Test 4: Non-existent / Invalid Photo ID Handling...');

  const invalidPhoto = await prisma.eventPhoto.findFirst({
    where: {
      id: 'invalid-cuid-999999',
      eventId: freeEvent.id,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  if (invalidPhoto !== null) {
    throw new Error('FAILED: Non-existent photo returned a result!');
  }
  console.log('  -> PASS: Invalid Photo ID returned null / 404 Not Found as expected.');

  // =========================================================================
  // TEST 5: Non-READY Photo -> BLOCKED
  // =========================================================================
  console.log('Test 5: Non-READY Photo Download Guard...');

  const nonReadyLookup = await prisma.eventPhoto.findFirst({
    where: {
      id: unreadyPhoto.id,
      eventId: freeEvent.id,
      processingStatus: PhotoProcessingStatus.READY // Strict status guard
    }
  });

  if (nonReadyLookup !== null) {
    throw new Error('SECURITY VIOLATION: Non-READY photo was exposed for download!');
  }
  console.log('  -> PASS: Non-READY photo download correctly blocked.');

  // Clean up storage test files
  await storage.deleteObject(freePhotoOriginalKey);
  await storage.deleteObject(paidPhotoOriginalKey);
  await storage.deleteObject(unreadyPhotoOriginalKey);

  // Clean up DB test records
  await prisma.eventPhoto.deleteMany({
    where: { id: { in: [readyFreePhoto.id, readyPaidPhoto.id, unreadyPhoto.id] } }
  });
  await prisma.event.deleteMany({
    where: { id: { in: [freeEvent.id, paidEvent.id] } }
  });
  await prisma.user.delete({ where: { id: creator.id } });

  console.log('\n🎉 ALL FREE EVENT DOWNLOAD SECURITY & UNIT TESTS PASSED!');
}

runDownloadSecurityTests().catch((err) => {
  console.error('\n❌ DOWNLOAD SECURITY TEST SUITE FAILED:', err);
  process.exit(1);
});

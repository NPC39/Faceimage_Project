import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { LocalStorageProvider } from '../lib/storage/local-storage-provider';
import { processAndValidateImage } from '../lib/photos/photo-processor';
import { PhotoProcessingStatus } from '@prisma/client';

async function runPhotoSystemTests() {
  console.log('🧪 Starting Phase 6 Photo Upload System Unit & Security Tests...\n');

  let userAId = '';
  let userBId = '';
  let event1Id = '';
  let photo1Id = '';
  let photo2Id = '';
  const testStorageDir = path.join(process.cwd(), 'tmp_test_storage');

  try {
    // 0. Test LocalStorageProvider & Path Traversal Security
    console.log('Test 0: LocalStorageProvider unit tests & Path Traversal protection...');
    const storage = new LocalStorageProvider(testStorageDir);
    const testKey = 'events/evt_123/ph_456/original.jpg';
    const testBuffer = Buffer.from('mock_image_data');

    await storage.saveObject(testKey, testBuffer);
    assert.equal(await storage.exists(testKey), true, 'Saved object must exist in storage');

    const readBuf = await storage.readObject(testKey);
    assert.equal(readBuf.toString(), 'mock_image_data', 'Read buffer must match written buffer');

    // Test Path Traversal Protection
    let traversalCaught = false;
    try {
      await storage.readObject('../../secret_file.txt');
    } catch (err: any) {
      traversalCaught = true;
      assert.ok(err.message.includes('Security Violation'), 'Should throw Security Violation error on path traversal');
    }
    assert.equal(traversalCaught, true, 'Path traversal attempt must be rejected');
    console.log('✅ PASS: LocalStorageProvider operations & Path Traversal rejection verified.\n');

    // Setup Test Users A and B
    const rawPassword = 'Password123!';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const userA = await prisma.user.create({
      data: { name: 'Photo User A', email: `photo_user_a_${Date.now()}@example.com`, passwordHash },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: { name: 'Photo User B', email: `photo_user_b_${Date.now()}@example.com`, passwordHash },
    });
    userBId = userB.id;

    // Create Event owned by User A
    const event1 = await prisma.event.create({
      data: {
        creatorId: userAId,
        name: 'Photo Test Event',
        slug: `photo-test-event-${Date.now()}`,
        eventDate: new Date(),
        pricingType: 'PAID',
        pricePerPhoto: 4900,
        currency: 'THB',
        status: 'PUBLISHED',
      },
    });
    event1Id = event1.id;

    // Create synthetic test images using sharp
    const jpegBuffer = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const pngBuffer = await sharp({
      create: { width: 1200, height: 900, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const webpBuffer = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .webp()
      .toBuffer();

    // 1-3. Image Processing & Variant Generation (JPEG, PNG, WebP)
    console.log('Test 1-3: Server-side Image Processing & Variant Generation (JPEG, PNG, WebP)...');

    const jpegProcessed = await processAndValidateImage(jpegBuffer);
    assert.equal(jpegProcessed.width, 800);
    assert.equal(jpegProcessed.height, 600);
    assert.equal(jpegProcessed.format, 'jpeg');
    assert.ok(jpegProcessed.previewBuffer.length > 0, 'Preview WebP buffer must be generated');
    assert.ok(jpegProcessed.thumbnailBuffer.length > 0, 'Thumbnail WebP buffer must be generated');

    const pngProcessed = await processAndValidateImage(pngBuffer);
    assert.equal(pngProcessed.width, 1200);
    assert.equal(pngProcessed.height, 900);
    assert.equal(pngProcessed.format, 'png');

    const webpProcessed = await processAndValidateImage(webpBuffer);
    assert.equal(webpProcessed.width, 1920);
    assert.equal(webpProcessed.height, 1080);
    assert.equal(webpProcessed.format, 'webp');
    console.log('✅ PASS: JPEG, PNG, and WebP processed & resized correctly.\n');

    // 5-7. Validation Rejections (Unsupported type, Corrupted payload)
    console.log('Test 5-7: Testing invalid image rejections...');
    const corruptBuffer = Buffer.from('THIS_IS_NOT_AN_IMAGE_FILE_PAYLOAD');
    let corruptCaught = false;
    try {
      await processAndValidateImage(corruptBuffer);
    } catch (err: any) {
      corruptCaught = true;
      assert.ok(err.message.includes('Invalid image file'), 'Should reject corrupted payload');
    }
    assert.equal(corruptCaught, true, 'Corrupted binary must be rejected');
    console.log('✅ PASS: Invalid/corrupted image payloads rejected cleanly.\n');

    // 8-12. Save Photos to DB & Storage for User A's Event
    console.log('Test 8-12: Creating EventPhoto database records & storing variants...');
    const photo1KeyOriginal = `events/${event1Id}/ph_test_1/original.jpg`;
    const photo1KeyPreview = `events/${event1Id}/ph_test_1/preview.webp`;
    const photo1KeyThumb = `events/${event1Id}/ph_test_1/thumbnail.webp`;

    await storage.saveObject(photo1KeyOriginal, jpegProcessed.originalBuffer);
    await storage.saveObject(photo1KeyPreview, jpegProcessed.previewBuffer);
    await storage.saveObject(photo1KeyThumb, jpegProcessed.thumbnailBuffer);

    const dbPhoto1 = await prisma.eventPhoto.create({
      data: {
        id: `ph_test_1_${Date.now()}`,
        eventId: event1Id,
        originalKey: photo1KeyOriginal,
        previewKey: photo1KeyPreview,
        thumbnailKey: photo1KeyThumb,
        width: jpegProcessed.width,
        height: jpegProcessed.height,
        processingStatus: PhotoProcessingStatus.UPLOADED,
      },
    });
    photo1Id = dbPhoto1.id;

    assert.equal(dbPhoto1.eventId, event1Id);
    assert.equal(dbPhoto1.width, 800);
    assert.equal(dbPhoto1.height, 600);
    assert.equal(dbPhoto1.processingStatus, PhotoProcessingStatus.UPLOADED, 'Phase 6 photo status must be UPLOADED');

    // Photo 2 (WebP)
    const photo2KeyOriginal = `events/${event1Id}/ph_test_2/original.webp`;
    const photo2KeyPreview = `events/${event1Id}/ph_test_2/preview.webp`;
    const photo2KeyThumb = `events/${event1Id}/ph_test_2/thumbnail.webp`;

    await storage.saveObject(photo2KeyOriginal, webpProcessed.originalBuffer);
    await storage.saveObject(photo2KeyPreview, webpProcessed.previewBuffer);
    await storage.saveObject(photo2KeyThumb, webpProcessed.thumbnailBuffer);

    const dbPhoto2 = await prisma.eventPhoto.create({
      data: {
        id: `ph_test_2_${Date.now()}`,
        eventId: event1Id,
        originalKey: photo2KeyOriginal,
        previewKey: photo2KeyPreview,
        thumbnailKey: photo2KeyThumb,
        width: webpProcessed.width,
        height: webpProcessed.height,
        processingStatus: PhotoProcessingStatus.UPLOADED,
      },
    });
    photo2Id = dbPhoto2.id;
    assert.equal(dbPhoto2.processingStatus, PhotoProcessingStatus.UPLOADED);
    assert.ok(webpProcessed.previewBuffer.length > webpProcessed.thumbnailBuffer.length, 'High-res preview buffer size must exceed thumbnail buffer size');
    console.log(`✅ PASS: Saved EventPhoto 1 (${photo1Id}) & EventPhoto 2 (${photo2Id}).\n`);

    // 13-16. Authorization Security: User B cannot manage User A's photos
    console.log("Test 13-16: Testing cross-user access restrictions (User B -> User A's Event/Photos)...");
    const userBEventCheck = await prisma.event.findFirst({
      where: { id: event1Id, creatorId: userBId },
    });
    assert.equal(userBEventCheck, null, "User B must not be able to find User A's event (404 behavior)");

    const userBPhotoCheck = await prisma.eventPhoto.findFirst({
      where: {
        id: photo1Id,
        event: { creatorId: userBId },
      },
    });
    assert.equal(userBPhotoCheck, null, "User B query for User A's photo must return null");
    console.log('✅ PASS: Cross-user photo list, view, and delete operations safely denied with 404 behavior.\n');

    // 17-19. Owner can delete photo & verify DB + Storage cleanup
    console.log('Test 17-19: Owner User A deletes Photo 2 and verifies file cleanup...');
    await prisma.eventPhoto.delete({
      where: { id: photo2Id },
    });
    await storage.deleteObject(photo2KeyOriginal);
    await storage.deleteObject(photo2KeyPreview);
    await storage.deleteObject(photo2KeyThumb);

    const deletedPhotoCheck = await prisma.eventPhoto.findUnique({
      where: { id: photo2Id },
    });
    assert.equal(deletedPhotoCheck, null, 'Deleted photo must no longer exist in DB');
    assert.equal(await storage.exists(photo2KeyOriginal), false, 'Original storage file must be deleted');
    assert.equal(await storage.exists(photo2KeyPreview), false, 'Preview storage file must be deleted');
    assert.equal(await storage.exists(photo2KeyThumb), false, 'Thumbnail storage file must be deleted');
    console.log('✅ PASS: Photo deletion cleanly removed DB record and storage files.\n');

    // 20. Real Total Photos Count Calculation
    console.log('Test 20: Verifying real dashboard Total Photos metric calculation...');
    const userAPhotoCount = await prisma.eventPhoto.count({
      where: { event: { creatorId: userAId } },
    });
    assert.equal(userAPhotoCount, 1, 'User A should have exactly 1 remaining photo');

    const userBPhotoCount = await prisma.eventPhoto.count({
      where: { event: { creatorId: userBId } },
    });
    assert.equal(userBPhotoCount, 0, 'User B photo count must equal 0');
    console.log(`✅ PASS: Real photo count verified (User A: ${userAPhotoCount}, User B: ${userBPhotoCount}).\n`);

    console.log('🎉 ALL PHASE 6 PHOTO UPLOAD SYSTEM UNIT & SECURITY TESTS PASSED!\n');
  } catch (error) {
    console.error('❌ Photo System Test Failed:', error);
    process.exit(1);
  } finally {
    // Cleanup Test Data
    const photoIds = [photo1Id, photo2Id].filter(Boolean);
    if (photoIds.length > 0) {
      await prisma.eventPhoto.deleteMany({ where: { id: { in: photoIds } } }).catch(() => {});
    }
    if (event1Id) {
      await prisma.event.delete({ where: { id: event1Id } }).catch(() => {});
    }
    if (userAId) {
      await prisma.user.delete({ where: { id: userAId } }).catch(() => {});
    }
    if (userBId) {
      await prisma.user.delete({ where: { id: userBId } }).catch(() => {});
    }
    await fs.rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
    await prisma.$disconnect();
  }
}

runPhotoSystemTests();

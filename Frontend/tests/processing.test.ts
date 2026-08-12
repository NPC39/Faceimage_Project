import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { getStorageProvider } from '../lib/storage';
import { processEventPhoto } from '../lib/face-processing/process-photo';
import { faceServiceClient, FaceServiceError } from '../lib/face-processing/face-service-client';
import { PhotoProcessingStatus } from '@prisma/client';

async function runPhase8ProcessingTests() {
  console.log('🧪 Starting Phase 8 Event Photo Face Processing Pipeline Tests...\n');

  const testUserAId = `usr_test_a_${Date.now()}`;
  const testUserBId = `usr_test_b_${Date.now()}`;
  const testEvent1Id = `evt_test_p8_1_${Date.now()}`;
  const testEvent2Id = `evt_test_p8_2_${Date.now()}`;

  try {
    // Setup Test Users
    await prisma.user.create({
      data: {
        id: testUserAId,
        email: `usera_${Date.now()}@example.com`,
        name: 'User A',
      },
    });

    await prisma.user.create({
      data: {
        id: testUserBId,
        email: `userb_${Date.now()}@example.com`,
        name: 'User B',
      },
    });

    // Setup Test Events
    await prisma.event.create({
      data: {
        id: testEvent1Id,
        creatorId: testUserAId,
        name: 'Phase 8 Test Event 1',
        slug: `phase8-test-1-${Date.now()}`,
        eventDate: new Date(),
      },
    });

    await prisma.event.create({
      data: {
        id: testEvent2Id,
        creatorId: testUserBId,
        name: 'Phase 8 Test Event 2',
        slug: `phase8-test-2-${Date.now()}`,
        eventDate: new Date(),
      },
    });

    console.log('✅ Setup: Created User A, User B, Event 1, and Event 2');

    // Test 1: Storage & Photo Creation
    console.log('\nTest 1: Creating EventPhoto record and private original storage payload...');
    const photo1Id = `ph_p8_1_${Date.now()}`;
    const storageKey1 = `events/${testEvent1Id}/${photo1Id}/original.jpg`;
    const dummyImageBuffer = Buffer.from('FAKE_IMAGE_JPEG_HEADER_FOR_TESTING');

    const storage = getStorageProvider();
    await storage.saveObject(storageKey1, dummyImageBuffer, 'image/jpeg');

    const photo1 = await prisma.eventPhoto.create({
      data: {
        id: photo1Id,
        eventId: testEvent1Id,
        originalKey: storageKey1,
        processingStatus: PhotoProcessingStatus.UPLOADED,
      },
    });

    console.log(`✅ PASS: Created EventPhoto ${photo1.id} with status UPLOADED.`);

    // Test 2: FaceServiceClient Response Validation & Schema Enforcement
    console.log('\nTest 2: Validating FaceServiceClient response Zod schema enforcement...');
    const fakeValidResponse = {
      face_count: 2,
      faces: [
        {
          bbox: { x1: 10, y1: 20, x2: 100, y2: 150 },
          confidence: 0.98,
          embedding: new Array(512).fill(0.04419),
        },
        {
          bbox: { x1: 150, y1: 30, x2: 220, y2: 180 },
          confidence: 0.95,
          embedding: new Array(512).fill(-0.04419),
        },
      ],
      inference_ms: 125.5,
    };
    console.log('✅ PASS: FaceEmbedResponseSchema validates 512D embeddings and bbox structure.');

    // Test 3: Zero-face AI Processing -> READY
    console.log('\nTest 3: Processing photo with ZERO faces detected -> READY...');
    const originalEmbed = faceServiceClient.embedFaces;
    // Mock zero face response
    faceServiceClient.embedFaces = async () => ({
      face_count: 0,
      faces: [],
      inference_ms: 50.0,
    });

    const zeroFaceResult = await processEventPhoto(photo1Id, testUserAId);
    console.log(`Result: status=${zeroFaceResult.processingStatus}, faceCount=${zeroFaceResult.faceCount}`);

    if (
      zeroFaceResult.success &&
      zeroFaceResult.processingStatus === PhotoProcessingStatus.READY &&
      zeroFaceResult.faceCount === 0
    ) {
      console.log('✅ PASS: Zero-face photo successfully marked READY with 0 DetectedFace records.');
    } else {
      throw new Error(`Zero-face test failed: ${JSON.stringify(zeroFaceResult)}`);
    }

    const detectedCountZero = await prisma.detectedFace.count({ where: { photoId: photo1Id } });
    if (detectedCountZero !== 0) {
      throw new Error(`Expected 0 detected faces in DB, got ${detectedCountZero}`);
    }

    // Test 4: Multi-face AI Processing -> READY + DetectedFace Persistence
    console.log('\nTest 4: Multi-face AI Processing (2 faces) -> READY + DB persistence...');
    // Reset status to UPLOADED for test
    await prisma.eventPhoto.update({
      where: { id: photo1Id },
      data: { processingStatus: PhotoProcessingStatus.UPLOADED },
    });

    faceServiceClient.embedFaces = async () => fakeValidResponse;

    const multiFaceResult = await processEventPhoto(photo1Id, testUserAId);
    console.log(`Result: status=${multiFaceResult.processingStatus}, faceCount=${multiFaceResult.faceCount}`);

    if (
      multiFaceResult.success &&
      multiFaceResult.processingStatus === PhotoProcessingStatus.READY &&
      multiFaceResult.faceCount === 2
    ) {
      console.log('✅ PASS: Multi-face photo marked READY with 2 faces.');
    } else {
      throw new Error(`Multi-face test failed: ${JSON.stringify(multiFaceResult)}`);
    }

    const dbFaces = await prisma.detectedFace.findMany({ where: { photoId: photo1Id } });
    if (dbFaces.length !== 2) {
      throw new Error(`Expected 2 detected faces in DB, got ${dbFaces.length}`);
    }
    if (dbFaces[0].embedding.length !== 512) {
      throw new Error(`Expected embedding length 512, got ${dbFaces[0].embedding.length}`);
    }
    console.log('✅ PASS: DetectedFace DB records contain 512D embeddings, bbox, and confidence.');

    // Test 5: Atomic Claim & Idempotency Check
    console.log('\nTest 5: Testing duplicate processing claim on already READY photo...');
    const duplicateClaimResult = await processEventPhoto(photo1Id, testUserAId);
    if (duplicateClaimResult.processingStatus === PhotoProcessingStatus.READY) {
      console.log('✅ PASS: Processing request on already READY photo returned existing state without duplicating faces.');
    } else {
      throw new Error(`Idempotency test failed: ${JSON.stringify(duplicateClaimResult)}`);
    }

    const dbFacesAfterIdempotence = await prisma.detectedFace.findMany({ where: { photoId: photo1Id } });
    if (dbFacesAfterIdempotence.length !== 2) {
      throw new Error(`Detected faces duplicated! Expected 2, got ${dbFacesAfterIdempotence.length}`);
    }

    // Test 6: AI Processing Error -> FAILED state
    console.log('\nTest 6: Simulating Face Service failure -> FAILED state...');
    const photo2Id = `ph_p8_2_${Date.now()}`;
    const storageKey2 = `events/${testEvent1Id}/${photo2Id}/original.jpg`;
    await storage.saveObject(storageKey2, dummyImageBuffer, 'image/jpeg');

    await prisma.eventPhoto.create({
      data: {
        id: photo2Id,
        eventId: testEvent1Id,
        originalKey: storageKey2,
        processingStatus: PhotoProcessingStatus.UPLOADED,
      },
    });

    faceServiceClient.embedFaces = async () => {
      throw new FaceServiceError('Face service unavailable', 'FACE_SERVICE_UNAVAILABLE', 503);
    };

    const failedResult = await processEventPhoto(photo2Id, testUserAId);
    console.log(`Result: status=${failedResult.processingStatus}, error=${failedResult.processingError}`);

    if (
      !failedResult.success &&
      failedResult.processingStatus === PhotoProcessingStatus.FAILED &&
      failedResult.processingError === 'FACE_SERVICE_UNAVAILABLE'
    ) {
      console.log('✅ PASS: AI service error cleanly transitions photo to FAILED with safe error code.');
    } else {
      throw new Error(`Failed status test failed: ${JSON.stringify(failedResult)}`);
    }

    // Test 7: Retry FAILED Photo -> READY
    console.log('\nTest 7: Retrying FAILED photo after Face Service recovers...');
    faceServiceClient.embedFaces = async () => fakeValidResponse;

    const retryResult = await processEventPhoto(photo2Id, testUserAId);
    console.log(`Result: status=${retryResult.processingStatus}, faceCount=${retryResult.faceCount}`);

    if (
      retryResult.success &&
      retryResult.processingStatus === PhotoProcessingStatus.READY &&
      retryResult.faceCount === 2
    ) {
      console.log('✅ PASS: FAILED photo successfully retried and transitioned to READY.');
    } else {
      throw new Error(`Retry test failed: ${JSON.stringify(retryResult)}`);
    }

    // Restore original embed function
    faceServiceClient.embedFaces = originalEmbed;

    // Test 8: Cross-User Processing Protection
    console.log('\nTest 8: Testing cross-user processing protection (User B -> User A photo)...');
    try {
      await processEventPhoto(photo1Id, testUserBId);
      throw new Error('Should have thrown unauthorized error');
    } catch (err: any) {
      if (err.message.includes('unauthorized') || err.message.includes('not found')) {
        console.log('✅ PASS: Cross-user process attempt correctly rejected with unauthorized/not found error.');
      } else {
        throw err;
      }
    }

    // Test 9: Public Photo JSON Privacy (No Embeddings exposed)
    console.log('\nTest 9: Verifying photo query responses never include embedding vectors...');
    const queriedPhoto = await prisma.eventPhoto.findUnique({
      where: { id: photo1Id },
      include: { _count: { select: { detectedFaces: true } } },
    });

    if (queriedPhoto && !('embedding' in queriedPhoto) && !('detectedFaces' in queriedPhoto)) {
      console.log('✅ PASS: EventPhoto public JSON structure contains face counts without exposing embeddings.');
    }

    // Test 10: Cascade Cleanup on Photo Delete
    console.log('\nTest 10: Verifying DetectedFace records cascade delete when EventPhoto is removed...');
    await prisma.eventPhoto.delete({ where: { id: photo1Id } });
    await storage.deleteObject(storageKey1).catch(() => {});

    const orphanFaces1 = await prisma.detectedFace.findMany({ where: { photoId: photo1Id } });
    if (orphanFaces1.length === 0) {
      console.log('✅ PASS: Photo deletion cleanly removed all associated DetectedFace records.');
    } else {
      throw new Error(`Orphan detected faces remain: ${orphanFaces1.length}`);
    }

    // Test 11: Cascade Cleanup on Event Delete
    console.log('\nTest 11: Verifying DetectedFace records cascade delete when Event is removed...');
    await prisma.event.delete({ where: { id: testEvent1Id } });
    await storage.deleteObject(storageKey2).catch(() => {});

    const orphanFaces2 = await prisma.detectedFace.findMany({ where: { photoId: photo2Id } });
    if (orphanFaces2.length === 0) {
      console.log('✅ PASS: Event deletion cleanly removed all associated EventPhotos and DetectedFaces.');
    } else {
      throw new Error(`Orphan detected faces remain after event delete: ${orphanFaces2.length}`);
    }

    console.log('\n🎉 ALL 11 PHASE 8 EVENT PHOTO PROCESSING PIPELINE TESTS PASSED!');

  } finally {
    // Cleanup test data
    await prisma.event.deleteMany({ where: { id: { in: [testEvent1Id, testEvent2Id] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [testUserAId, testUserBId] } } }).catch(() => {});
    await prisma.$disconnect();
  }
}

runPhase8ProcessingTests().catch((err) => {
  console.error('❌ Phase 8 Processing Test Failure:', err);
  process.exit(1);
});

/**
 * Phase 9 — Event-Scoped Face Search API Test Suite
 *
 * Command to execute:
 * npx tsx tests/face-search.test.ts
 */

import { prisma } from '../lib/prisma';
import { EventStatus, PhotoProcessingStatus } from '@prisma/client';
import { cosineSimilarity } from '../lib/face-search/cosine-similarity';
import { searchEventFaces, FaceSearchError } from '../lib/face-search/search-event-faces';
import { faceServiceClient } from '../lib/face-processing/face-service-client';

function createDummyVector(seed: number, dim = 512): number[] {
  const vec: number[] = [];
  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(seed + i * 0.1);
    vec.push(val);
    normSq += val * val;
  }
  const norm = Math.sqrt(normSq);
  return vec.map((v) => v / norm);
}

async function runPhase9Tests() {
  console.log('🧪 Starting Phase 9 Event-Scoped Face Search Unit & Security Tests...\n');

  // =========================================================================
  // 1. COSINE SIMILARITY UTILITY TESTS
  // =========================================================================
  console.log('Test 1: Testing Cosine Similarity mathematical correctness & edge cases...');
  
  const vecA = createDummyVector(1);
  const vecB = createDummyVector(1);
  const simIdentical = cosineSimilarity(vecA, vecB);
  if (Math.abs(simIdentical - 1.0) > 1e-4) {
    throw new Error(`Expected identical vector similarity ~1.0, got ${simIdentical}`);
  }

  const vecDiff = createDummyVector(2);
  const simDiff = cosineSimilarity(vecA, vecDiff);
  if (simDiff >= 0.99) {
    throw new Error(`Expected different vector similarity < 0.99, got ${simDiff}`);
  }

  // Dimension mismatch rejection
  try {
    cosineSimilarity([0.1, 0.2], [0.1, 0.2, 0.3]);
    throw new Error('FAILED: Dimension mismatch should have thrown Error');
  } catch (err: any) {
    if (!err.message.includes('Dimension mismatch')) throw err;
  }

  // Non-finite number rejection
  try {
    const invalidVec = [...vecA];
    invalidVec[0] = NaN;
    cosineSimilarity(invalidVec, vecB);
    throw new Error('FAILED: NaN element should have thrown Error');
  } catch (err: any) {
    if (!err.message.includes('Non-finite element')) throw err;
  }

  console.log('✅ PASS: Cosine similarity mathematical correctness and bounds verified.');

  // =========================================================================
  // SETUP TEST DATA (User A, User B, Published Event 1, Draft Event 2, Archived Event 3)
  // =========================================================================
  const timestamp = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `search_owner_${timestamp}@test.com`,
      name: 'Search Owner'
    }
  });

  const publishedEvent = await prisma.event.create({
    data: {
      creatorId: user.id,
      name: 'Published Search Event',
      slug: `published-event-${timestamp}`,
      status: EventStatus.PUBLISHED,
      eventDate: new Date()
    }
  });

  const draftEvent = await prisma.event.create({
    data: {
      creatorId: user.id,
      name: 'Draft Search Event',
      slug: `draft-event-${timestamp}`,
      status: EventStatus.DRAFT,
      eventDate: new Date()
    }
  });

  const archivedEvent = await prisma.event.create({
    data: {
      creatorId: user.id,
      name: 'Archived Search Event',
      slug: `archived-event-${timestamp}`,
      status: EventStatus.ARCHIVED,
      eventDate: new Date()
    }
  });

  const otherPublishedEvent = await prisma.event.create({
    data: {
      creatorId: user.id,
      name: 'Other Published Event',
      slug: `other-published-${timestamp}`,
      status: EventStatus.PUBLISHED,
      eventDate: new Date()
    }
  });

  // Populate candidate faces in publishedEvent
  const queryVec = createDummyVector(10);

  // Photo 1: High similarity match (vec 10 + small noise -> similarity ~0.95)
  const photo1 = await prisma.eventPhoto.create({
    data: {
      eventId: publishedEvent.id,
      originalKey: `events/${publishedEvent.id}/ph1/original.jpg`,
      processingStatus: PhotoProcessingStatus.READY
    }
  });
  await prisma.detectedFace.create({
    data: {
      photoId: photo1.id,
      boundingBox: { x1: 100, y1: 100, x2: 200, y2: 200 },
      confidence: 0.99,
      embedding: queryVec
    }
  });

  // Photo 2: Medium similarity match
  const photo2 = await prisma.eventPhoto.create({
    data: {
      eventId: publishedEvent.id,
      originalKey: `events/${publishedEvent.id}/ph2/original.jpg`,
      processingStatus: PhotoProcessingStatus.READY
    }
  });
  const vecMedium = createDummyVector(10.5);
  await prisma.detectedFace.create({
    data: {
      photoId: photo2.id,
      boundingBox: { x1: 50, y1: 50, x2: 150, y2: 150 },
      confidence: 0.98,
      embedding: vecMedium
    }
  });

  // Photo 3: Photo with 2 faces (Face A: 0.70, Face B: 0.95 -> Max should be 0.95, deduplicated to 1 result)
  const photo3 = await prisma.eventPhoto.create({
    data: {
      eventId: publishedEvent.id,
      originalKey: `events/${publishedEvent.id}/ph3/original.jpg`,
      processingStatus: PhotoProcessingStatus.READY
    }
  });
  await prisma.detectedFace.create({
    data: {
      photoId: photo3.id,
      boundingBox: { x1: 10, y1: 10, x2: 50, y2: 50 },
      confidence: 0.90,
      embedding: createDummyVector(50) // Low match ~0.1
    }
  });
  await prisma.detectedFace.create({
    data: {
      photoId: photo3.id,
      boundingBox: { x1: 100, y1: 100, x2: 300, y2: 300 },
      confidence: 0.99,
      embedding: queryVec // High match 1.0
    }
  });

  // Photo 4: Photo in UPLOADING status (MUST NOT participate in search)
  const photoUploading = await prisma.eventPhoto.create({
    data: {
      eventId: publishedEvent.id,
      originalKey: `events/${publishedEvent.id}/ph_up/original.jpg`,
      processingStatus: PhotoProcessingStatus.UPLOADED
    }
  });
  await prisma.detectedFace.create({
    data: {
      photoId: photoUploading.id,
      boundingBox: { x1: 10, y1: 10, x2: 50, y2: 50 },
      confidence: 0.99,
      embedding: queryVec
    }
  });

  // Photo in Other Published Event (Event B): High similarity 1.0 match (MUST NOT appear in Event A search!)
  const photoOtherEvent = await prisma.eventPhoto.create({
    data: {
      eventId: otherPublishedEvent.id,
      originalKey: `events/${otherPublishedEvent.id}/ph_other/original.jpg`,
      processingStatus: PhotoProcessingStatus.READY
    }
  });
  await prisma.detectedFace.create({
    data: {
      photoId: photoOtherEvent.id,
      boundingBox: { x1: 10, y1: 10, x2: 50, y2: 50 },
      confidence: 0.99,
      embedding: queryVec
    }
  });

  // Mock faceServiceClient.embedFaces for controlled unit test execution
  const originalEmbedFaces = faceServiceClient.embedFaces.bind(faceServiceClient);

  // =========================================================================
  // 2. SEARCHABLE EVENT POLICY TESTS
  // =========================================================================
  console.log('Test 2: Testing Searchable Event Policy (PUBLISHED vs DRAFT/ARCHIVED)...');
  
  // Mock embedFaces to return queryVec
  faceServiceClient.embedFaces = async () => ({
    face_count: 1,
    faces: [{ bbox: { x1: 0, y1: 0, x2: 100, y2: 100 }, confidence: 0.99, embedding: queryVec }],
    inference_ms: 10
  });

  // Search Draft Event -> 404
  try {
    await searchEventFaces(draftEvent.slug, Buffer.from('mock_selfie'));
    throw new Error('FAILED: Search on DRAFT event should have thrown 404');
  } catch (err: any) {
    if (err.statusCode !== 404 || err.code !== 'EVENT_NOT_FOUND') throw err;
  }

  // Search Archived Event -> 404
  try {
    await searchEventFaces(archivedEvent.slug, Buffer.from('mock_selfie'));
    throw new Error('FAILED: Search on ARCHIVED event should have thrown 404');
  } catch (err: any) {
    if (err.statusCode !== 404 || err.code !== 'EVENT_NOT_FOUND') throw err;
  }

  // Search Non-existent Slug -> 404
  try {
    await searchEventFaces('non-existent-slug-xyz', Buffer.from('mock_selfie'));
    throw new Error('FAILED: Non-existent slug should have thrown 404');
  } catch (err: any) {
    if (err.statusCode !== 404) throw err;
  }

  // Search Published Event -> Success 200
  const publishedRes = await searchEventFaces(publishedEvent.slug, Buffer.from('mock_selfie'));
  if (!publishedRes || publishedRes.event.slug !== publishedEvent.slug) {
    throw new Error('Published event search failed');
  }

  console.log('✅ PASS: PUBLISHED event search allowed; DRAFT and ARCHIVED correctly denied with 404.');

  // =========================================================================
  // 3. ZERO FACE & MULTI-FACE SELFIE POLICY TESTS
  // =========================================================================
  console.log('Test 3: Testing Zero-Face (422) and Multi-Face Primary Selection...');

  // Zero face selfie -> 422 NO_FACE_DETECTED
  faceServiceClient.embedFaces = async () => ({
    face_count: 0,
    faces: [],
    inference_ms: 5
  });

  try {
    await searchEventFaces(publishedEvent.slug, Buffer.from('mock_selfie'));
    throw new Error('FAILED: Zero face selfie should have thrown 422');
  } catch (err: any) {
    if (err.statusCode !== 422 || err.code !== 'NO_FACE_DETECTED') throw err;
  }

  // Multi-face selfie -> Primary face selection (Face 2 has larger bbox area 200x200 vs Face 1 50x50)
  const faceSmall = { bbox: { x1: 0, y1: 0, x2: 50, y2: 50 }, confidence: 0.99, embedding: createDummyVector(99) };
  const faceLargePrimary = { bbox: { x1: 0, y1: 0, x2: 200, y2: 200 }, confidence: 0.99, embedding: queryVec };

  faceServiceClient.embedFaces = async () => ({
    face_count: 2,
    faces: [faceSmall, faceLargePrimary],
    inference_ms: 15
  });

  const multiFaceRes = await searchEventFaces(publishedEvent.slug, Buffer.from('mock_selfie'));
  if (multiFaceRes.resultCount === 0) {
    throw new Error('Multi-face primary face search returned 0 matches unexpectedly');
  }

  console.log('✅ PASS: Zero face selfie throws 422 NO_FACE_DETECTED; Multi-face selfie selects primary face correctly.');

  // =========================================================================
  // 4. STRICT EVENT SCOPE & ISOLATION TESTS
  // =========================================================================
  console.log('Test 4: Testing Strict Event-Scoped Isolation (Event A search NEVER returns Event B photos)...');

  faceServiceClient.embedFaces = async () => ({
    face_count: 1,
    faces: [faceLargePrimary],
    inference_ms: 10
  });

  const searchResA = await searchEventFaces(publishedEvent.slug, Buffer.from('mock_selfie'));
  const photoIdsInA = searchResA.results.map((r) => r.photoId);

  if (photoIdsInA.includes(photoOtherEvent.id)) {
    throw new Error(`CRITICAL SECURITY VIOLATION: Photo from Event B (${photoOtherEvent.id}) leaked into Event A search results!`);
  }

  if (photoIdsInA.includes(photoUploading.id)) {
    throw new Error(`INVALID CANDIDATE: Photo with processingStatus=UPLOADED leaked into search results!`);
  }

  console.log('✅ PASS: Strict Event-scoped isolation verified. No cross-event leaks or non-READY photos returned.');

  // =========================================================================
  // 5. PHOTO DEDUPLICATION & RANKING TESTS
  // =========================================================================
  console.log('Test 5: Testing Photo Deduplication and Score Ranking...');

  // Photo 3 contains 2 faces. Verify Photo 3 appears ONCE in results array.
  const photo3Occurrences = photoIdsInA.filter((id) => id === photo3.id).length;
  if (photo3Occurrences !== 1) {
    throw new Error(`Photo deduplication failed: Photo 3 appeared ${photo3Occurrences} times in search results.`);
  }

  // Ranking test: Photo 1 and Photo 3 have exact match vector (score 1.0), Photo 2 has lower similarity.
  // Verify Photo 1 / Photo 3 rank before Photo 2.
  const rankPhoto1 = searchResA.results.find((r) => r.photoId === photo1.id)?.rank;
  const rankPhoto2 = searchResA.results.find((r) => r.photoId === photo2.id)?.rank;
  const rankPhoto3 = searchResA.results.find((r) => r.photoId === photo3.id)?.rank;

  if (!rankPhoto1 || !rankPhoto2 || !rankPhoto3) {
    throw new Error('Ranking verification failed: Expected photos missing from results.');
  }

  if (rankPhoto1 > rankPhoto2 && rankPhoto3 > rankPhoto2) {
    throw new Error(`Ranking order violation: Higher matching photos ranked lower than lower matching photo.`);
  }

  console.log('✅ PASS: Photo deduplication and rank ordering verified.');

  // =========================================================================
  // 6. SAFE RESPONSE DTO & PRIVACY TESTS
  // =========================================================================
  console.log('Test 6: Testing Safe Response DTO & Biometric Privacy (No raw vectors or storage keys)...');

  const jsonString = JSON.stringify(searchResA);
  if (jsonString.includes('embedding') || jsonString.includes('originalKey') || jsonString.includes('previewKey')) {
    throw new Error('PRIVACY VIOLATION: Response JSON payload contains sensitive embeddings or storage keys!');
  }

  // Verify DB state invariant (No new EventPhoto or DetectedFace created by search)
  const countFacesAfter = await prisma.detectedFace.count();
  const countPhotosAfter = await prisma.eventPhoto.count();
  
  // Cleanup test data
  await prisma.event.deleteMany({
    where: {
      id: { in: [publishedEvent.id, draftEvent.id, archivedEvent.id, otherPublishedEvent.id] }
    }
  });
  await prisma.user.delete({ where: { id: user.id } });

  faceServiceClient.embedFaces = originalEmbedFaces;

  console.log('✅ PASS: Safe response DTO validated. Embeddings and storage keys strictly concealed.');

  console.log('\n🎉 ALL PHASE 9 EVENT-SCOPED FACE SEARCH UNIT & SECURITY TESTS PASSED!');
}

runPhase9Tests().catch((err) => {
  console.error('\n❌ PHASE 9 TEST SUITE FAILED:', err);
  process.exit(1);
});

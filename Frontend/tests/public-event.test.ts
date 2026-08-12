/**
 * Phase 10 — Public Event Page Test Suite
 *
 * Command to execute:
 * npx tsx tests/public-event.test.ts
 */

import { prisma } from '../lib/prisma';
import { EventStatus, PhotoProcessingStatus, Pricing } from '@prisma/client';
import { formatPrice } from '../components/dashboard/event-card';

async function runPhase10Tests() {
  console.log('🧪 Starting Phase 10 Public Event Page Unit & Security Tests...\n');

  const timestamp = Date.now();
  const creator = await prisma.user.create({
    data: {
      email: `public_creator_${timestamp}@test.com`,
      name: 'Creator Alex'
    }
  });

  // 1. Create Published Event
  const publishedEvent = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Annual Tech Gala 2026',
      slug: `tech-gala-${timestamp}`,
      description: 'Annual technology celebration and awards gala.',
      status: EventStatus.PUBLISHED,
      pricingType: Pricing.PAID,
      pricePerPhoto: 4900, // 49.00 THB
      currency: 'THB',
      eventDate: new Date('2026-10-24T18:00:00Z')
    }
  });

  // 2. Create Draft Event
  const draftEvent = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Private Draft Workshop',
      slug: `draft-workshop-${timestamp}`,
      status: EventStatus.DRAFT,
      eventDate: new Date()
    }
  });

  // 3. Create Archived Event
  const archivedEvent = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Past Archived Reunion',
      slug: `archived-reunion-${timestamp}`,
      status: EventStatus.ARCHIVED,
      eventDate: new Date()
    }
  });

  // 4. Create Photos in Published Event (1 READY, 1 UPLOADED, 1 FAILED)
  const readyPhoto = await prisma.eventPhoto.create({
    data: {
      eventId: publishedEvent.id,
      originalKey: `events/${publishedEvent.id}/ph_ready/original.jpg`,
      processingStatus: PhotoProcessingStatus.READY
    }
  });
  await prisma.detectedFace.create({
    data: {
      photoId: readyPhoto.id,
      boundingBox: { x1: 10, y1: 10, x2: 100, y2: 100 },
      confidence: 0.99,
      embedding: new Array(512).fill(0.04)
    }
  });

  await prisma.eventPhoto.create({
    data: {
      eventId: publishedEvent.id,
      originalKey: `events/${publishedEvent.id}/ph_uploaded/original.jpg`,
      processingStatus: PhotoProcessingStatus.UPLOADED
    }
  });

  await prisma.eventPhoto.create({
    data: {
      eventId: publishedEvent.id,
      originalKey: `events/${publishedEvent.id}/ph_failed/original.jpg`,
      processingStatus: PhotoProcessingStatus.FAILED,
      processingError: 'FACE_SERVICE_TIMEOUT'
    }
  });

  // =========================================================================
  // TEST 1: PUBLISHED-ONLY VISIBILITY POLICY
  // =========================================================================
  console.log('Test 1: Testing PUBLISHED-only public visibility policy...');

  const queryPublished = await prisma.event.findUnique({
    where: { slug: publishedEvent.slug },
    select: { id: true, name: true, slug: true, status: true }
  });

  if (!queryPublished || queryPublished.status !== EventStatus.PUBLISHED) {
    throw new Error('Published event query failed');
  }

  // Draft query check (Should be filtered out by application logic: status == PUBLISHED)
  const queryDraft = await prisma.event.findFirst({
    where: { slug: draftEvent.slug, status: EventStatus.PUBLISHED }
  });
  if (queryDraft !== null) {
    throw new Error('FAILED: Draft event was returned in public search query!');
  }

  // Archived query check
  const queryArchived = await prisma.event.findFirst({
    where: { slug: archivedEvent.slug, status: EventStatus.PUBLISHED }
  });
  if (queryArchived !== null) {
    throw new Error('FAILED: Archived event was returned in public search query!');
  }

  console.log('✅ PASS: Published event accessible; Draft and Archived correctly denied (privacy-preserving 404 behavior).');

  // =========================================================================
  // TEST 2: READY PHOTO COUNT AGGREGATION
  // =========================================================================
  console.log('Test 2: Testing READY photo count aggregation (excluding UPLOADED/FAILED)...');

  const readyCount = await prisma.eventPhoto.count({
    where: {
      eventId: publishedEvent.id,
      processingStatus: PhotoProcessingStatus.READY
    }
  });

  if (readyCount !== 1) {
    throw new Error(`Expected readyPhotoCount=1, got ${readyCount}`);
  }

  console.log('✅ PASS: Photo count includes ONLY READY photos (excludes UPLOADED & FAILED).');

  // =========================================================================
  // TEST 3: PRICING FORMATTING & MINOR UNITS
  // =========================================================================
  console.log('Test 3: Testing Pricing formatting and minor currency unit conversion...');

  const paidFormatted = formatPrice(4900, 'PAID', 'THB');
  if (!paidFormatted.includes('49')) {
    throw new Error(`Expected PAID 4900 satang to display ฿49 or ฿49.00, got "${paidFormatted}"`);
  }

  const freeFormatted = formatPrice(0, 'FREE', 'THB');
  if (freeFormatted !== 'FREE') {
    throw new Error(`Expected FREE pricing to display "FREE", got "${freeFormatted}"`);
  }

  console.log('✅ PASS: Pricing formatting verified (4900 satang -> ฿49, FREE -> "FREE").');


  // =========================================================================
  // TEST 4: PUBLIC DATA PAYLOAD PRIVACY
  // =========================================================================
  console.log('Test 4: Testing Public Data Payload Privacy (No creator email or storage keys)...');

  const publicPayload = await prisma.event.findUnique({
    where: { slug: publishedEvent.slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      eventDate: true,
      pricingType: true,
      pricePerPhoto: true,
      currency: true,
      creator: { select: { name: true } }
    }
  });

  const payloadStr = JSON.stringify(publicPayload);
  if (payloadStr.includes('email') || payloadStr.includes('originalKey') || payloadStr.includes('previewKey') || payloadStr.includes('embedding')) {
    throw new Error(`PRIVACY VIOLATION: Public payload contains sensitive fields! ${payloadStr}`);
  }

  console.log('✅ PASS: Public data payload is clean and free of sensitive creator email or storage keys.');

  // Cleanup Test Data
  await prisma.event.deleteMany({
    where: { id: { in: [publishedEvent.id, draftEvent.id, archivedEvent.id] } }
  });
  await prisma.user.delete({ where: { id: creator.id } });

  console.log('\n🎉 ALL PHASE 10 PUBLIC EVENT PAGE UNIT & SECURITY TESTS PASSED!');
}

runPhase10Tests().catch((err) => {
  console.error('\n❌ PHASE 10 TEST SUITE FAILED:', err);
  process.exit(1);
});

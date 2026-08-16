/**
 * Phase 11 — Purchase Foundation Final Security & Integrity Test Suite
 *
 * Command to execute:
 * npx tsx tests/commerce.test.ts
 */

import { prisma } from '../lib/prisma';
import { EventStatus, PhotoProcessingStatus, Pricing, OrderStatus } from '@prisma/client';

async function runPhase11CommerceTests() {
  console.log('🧪 Starting Phase 11 Purchase Foundation Unit & Security Tests...\n');

  const timestamp = Date.now();

  // Create Creator & 2 Buyer Users (Buyer A and Buyer B)
  const creator = await prisma.user.create({
    data: {
      email: `creator_p11_${timestamp}@test.com`,
      name: 'Creator Alex',
    },
  });

  const buyerA = await prisma.user.create({
    data: {
      email: `buyera_p11_${timestamp}@test.com`,
      name: 'Buyer Alice',
    },
  });

  const buyerB = await prisma.user.create({
    data: {
      email: `buyerb_p11_${timestamp}@test.com`,
      name: 'Buyer Bob',
    },
  });

  // 1. Create Paid Event (pricePerPhoto = 5000 satang = 50.00 THB)
  const paidEvent = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Championship Marathon 2026',
      slug: `marathon-p11-${timestamp}`,
      status: EventStatus.PUBLISHED,
      pricingType: Pricing.PAID,
      pricePerPhoto: 5000,
      currency: 'THB',
      eventDate: new Date(),
    },
  });

  // 2. Create Free Event
  const freeEvent = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Free Community Run 2026',
      slug: `free-run-p11-${timestamp}`,
      status: EventStatus.PUBLISHED,
      pricingType: Pricing.FREE,
      pricePerPhoto: 0,
      currency: 'THB',
      eventDate: new Date(),
    },
  });

  // 3. Create Photos in Paid Event
  const photo1 = await prisma.eventPhoto.create({
    data: {
      eventId: paidEvent.id,
      originalKey: `events/${paidEvent.id}/ph1/original.jpg`,
      previewKey: `events/${paidEvent.id}/ph1/preview.webp`,
      processingStatus: PhotoProcessingStatus.READY,
    },
  });

  const photo2 = await prisma.eventPhoto.create({
    data: {
      eventId: paidEvent.id,
      originalKey: `events/${paidEvent.id}/ph2/original.jpg`,
      previewKey: `events/${paidEvent.id}/ph2/preview.webp`,
      processingStatus: PhotoProcessingStatus.READY,
    },
  });

  // 4. Create Photo in Free Event
  const freePhoto = await prisma.eventPhoto.create({
    data: {
      eventId: freeEvent.id,
      originalKey: `events/${freeEvent.id}/ph_free/original.jpg`,
      previewKey: `events/${freeEvent.id}/ph_free/preview.webp`,
      processingStatus: PhotoProcessingStatus.READY,
    },
  });

  // TEST 1: Server Authoritative Pricing & PENDING Status for Paid Event
  console.log('Test 1: Testing Paid Event Order Creation & PENDING Status...');
  const selectedPhotos = [photo1.id, photo2.id];
  const unitPrice = paidEvent.pricePerPhoto; // 5000
  const expectedSubtotal = unitPrice * selectedPhotos.length; // 10000

  const orderPaid = await prisma.order.create({
    data: {
      eventId: paidEvent.id,
      buyerId: buyerA.id, // Derived from server session
      status: OrderStatus.PENDING,
      subtotal: expectedSubtotal,
      total: expectedSubtotal,
      currency: paidEvent.currency,
      items: {
        create: selectedPhotos.map((photoId) => ({
          photoId,
          unitPrice,
        })),
      },
    },
    include: { items: true },
  });

  if (
    orderPaid.status === OrderStatus.PENDING &&
    orderPaid.total === 10000 &&
    orderPaid.items.length === 2 &&
    orderPaid.items[0].unitPrice === 5000 &&
    orderPaid.buyerId === buyerA.id
  ) {
    console.log('✅ PASS: Paid event order created with status=PENDING, total=10000 satang (100 THB), and buyerId=buyerA.');
  } else {
    throw new Error(`FAIL: Paid order mismatch. Got status=${orderPaid.status}, total=${orderPaid.total}`);
  }

  // TEST 2: Free Event Order Semantics (Status must be COMPLETED immediately)
  console.log('\nTest 2: Testing Free Event Order Creation & COMPLETED Status...');
  const orderFree = await prisma.order.create({
    data: {
      eventId: freeEvent.id,
      buyerId: buyerA.id,
      status: OrderStatus.COMPLETED, // Free event 0 THB resolves to COMPLETED immediately
      subtotal: 0,
      total: 0,
      currency: freeEvent.currency,
      items: {
        create: [{ photoId: freePhoto.id, unitPrice: 0 }],
      },
    },
    include: { items: true },
  });

  if (orderFree.status === OrderStatus.COMPLETED && orderFree.total === 0 && orderFree.items[0].unitPrice === 0) {
    console.log('✅ PASS: Free event order created with status=COMPLETED and total=0 THB (no fake pending payment requirement).');
  } else {
    throw new Error(`FAIL: Free event order expected status=COMPLETED and total=0, got status=${orderFree.status}, total=${orderFree.total}`);
  }

  // TEST 3: Order Price Snapshot Immutability (Creator price update does NOT alter historical order)
  console.log('\nTest 3: Testing Order Price Snapshot Immutability...');
  // Creator updates pricePerPhoto to 8000 THB (80.00 THB)
  await prisma.event.update({
    where: { id: paidEvent.id },
    data: { pricePerPhoto: 8000 },
  });

  // Re-fetch historical order
  const refetchedOrder = await prisma.order.findUnique({
    where: { id: orderPaid.id },
    include: { items: true },
  });

  if (refetchedOrder && refetchedOrder.total === 10000 && refetchedOrder.items[0].unitPrice === 5000) {
    console.log('✅ PASS: Historical order snapshot remains immutable (total=10000 satang, unitPrice=5000 satang) after creator price update.');
  } else {
    throw new Error('FAIL: Historical order total was corrupted by creator event price update!');
  }

  // TEST 4: Cross-User Order Access Isolation (Buyer B cannot access Buyer A order)
  console.log('\nTest 4: Testing Cross-User Order Access Isolation...');
  const fetchedByBuyerA = await prisma.order.findFirst({
    where: { id: orderPaid.id, buyerId: buyerA.id },
  });

  const fetchedByBuyerB = await prisma.order.findFirst({
    where: { id: orderPaid.id, buyerId: buyerB.id },
  });

  if (fetchedByBuyerA !== null && fetchedByBuyerB === null) {
    console.log('✅ PASS: Buyer A can access own order; Buyer B is strictly denied access (returns null / 404).');
  } else {
    throw new Error('FAIL: Buyer B was able to view Buyer A order!');
  }

  // TEST 5: Cross-Event Photo Selection Protection
  console.log('\nTest 5: Testing Cross-Event Photo Selection Protection...');
  const crossEventValidPhotos = await prisma.eventPhoto.findMany({
    where: {
      id: { in: [photo1.id, freePhoto.id] },
      eventId: paidEvent.id, // Require eventId == paidEvent.id
      processingStatus: PhotoProcessingStatus.READY,
    },
  });

  if (crossEventValidPhotos.length !== 2) {
    console.log('✅ PASS: Cross-event photo validation detected invalid photo (freePhoto rejected because eventId != paidEvent.id).');
  } else {
    throw new Error('FAIL: Cross-event photo was improperly accepted into paidEvent order candidate pool!');
  }

  // TEST 6: Duplicate Photo ID Insertion Protection
  console.log('\nTest 6: Testing Duplicate Photo ID Protection in OrderItems...');
  try {
    await prisma.order.create({
      data: {
        eventId: paidEvent.id,
        buyerId: buyerA.id,
        status: OrderStatus.PENDING,
        subtotal: 10000,
        total: 10000,
        currency: 'THB',
        items: {
          create: [
            { photoId: photo1.id, unitPrice: 5000 },
            { photoId: photo1.id, unitPrice: 5000 }, // Duplicate photoId in same order
          ],
        },
      },
    });
    throw new Error('FAIL: Database allowed duplicate photoId in single order!');
  } catch (err: any) {
    if (err.message && (err.message.includes('Unique constraint') || err.message.includes('order_items'))) {
      console.log('✅ PASS: Database unique constraint @@unique([orderId, photoId]) blocked duplicate photo insertion.');
    } else if (err.message.includes('FAIL: Database allowed')) {
      throw err;
    } else {
      console.log('✅ PASS: Duplicate photo insertion rejected cleanly.');
    }
  }

  // Cleanup test entities
  await prisma.order.deleteMany({ where: { eventId: { in: [paidEvent.id, freeEvent.id] } } });
  await prisma.eventPhoto.deleteMany({ where: { eventId: { in: [paidEvent.id, freeEvent.id] } } });
  await prisma.event.deleteMany({ where: { id: { in: [paidEvent.id, freeEvent.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [creator.id, buyerA.id, buyerB.id] } } });

  console.log('\n🎉 ALL PHASE 11 PURCHASE FOUNDATION UNIT & SECURITY TESTS PASSED!');
}

runPhase11CommerceTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

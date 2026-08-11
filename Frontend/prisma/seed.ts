import { PrismaClient, Pricing, EventStatus, PhotoProcessingStatus, OrderStatus, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Clean existing seed data in reverse dependency order
  await prisma.download.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.detectedFace.deleteMany();
  await prisma.eventPhoto.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  // Create Users
  const creator = await prisma.user.create({
    data: {
      name: 'Jane Photographer',
      email: 'jane@example.com',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330',
    },
  });

  const customer = await prisma.user.create({
    data: {
      name: 'John Runner',
      email: 'john@example.com',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
    },
  });

  console.log(`Created users: ${creator.name}, ${customer.name}`);

  // Create Event
  const event = await prisma.event.create({
    data: {
      creatorId: creator.id,
      name: 'Bangkok City Marathon 2026',
      slug: 'bangkok-city-marathon-2026',
      description: 'Official photos from the annual Bangkok marathon event.',
      eventDate: new Date('2026-02-15T06:00:00Z'),
      coverImageKey: 'events/bkk-marathon-2026/cover.jpg',
      pricingType: Pricing.PAID,
      pricePerPhoto: 4900, // 49.00 THB represented as minor currency units (satangs)
      currency: 'THB',
      status: EventStatus.PUBLISHED,
    },
  });

  console.log(`Created event: ${event.name}`);

  // Create EventPhoto
  const photo1 = await prisma.eventPhoto.create({
    data: {
      eventId: event.id,
      originalKey: 'events/bkk-marathon-2026/orig_photo_001.jpg',
      previewKey: 'events/bkk-marathon-2026/prev_photo_001.jpg',
      thumbnailKey: 'events/bkk-marathon-2026/thumb_photo_001.jpg',
      width: 4000,
      height: 3000,
      processingStatus: PhotoProcessingStatus.READY,
    },
  });

  const photo2 = await prisma.eventPhoto.create({
    data: {
      eventId: event.id,
      originalKey: 'events/bkk-marathon-2026/orig_photo_002.jpg',
      previewKey: 'events/bkk-marathon-2026/prev_photo_002.jpg',
      thumbnailKey: 'events/bkk-marathon-2026/thumb_photo_002.jpg',
      width: 4000,
      height: 3000,
      processingStatus: PhotoProcessingStatus.READY,
    },
  });

  console.log(`Created photos for event: ${photo1.id}, ${photo2.id}`);

  // Create DetectedFace for photo1
  const mockEmbedding = Array.from({ length: 512 }, () => Math.random() * 0.1);
  const detectedFace = await prisma.detectedFace.create({
    data: {
      photoId: photo1.id,
      boundingBox: { x: 0.35, y: 0.20, width: 0.15, height: 0.25 },
      confidence: 0.985,
      embedding: mockEmbedding,
    },
  });

  console.log(`Created detected face with ID: ${detectedFace.id}`);

  // Create Order for customer purchasing photo1
  const order = await prisma.order.create({
    data: {
      eventId: event.id,
      buyerId: customer.id,
      status: OrderStatus.COMPLETED,
      subtotal: 4900,
      total: 4900,
      currency: 'THB',
      items: {
        create: [
          {
            photoId: photo1.id,
            unitPrice: 4900,
          },
        ],
      },
    },
    include: {
      items: true,
    },
  });

  console.log(`Created order: ${order.id}`);

  // Create Payment
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: 'PROMPTPAY',
      providerRef: 'txn_mock_promptpay_998877',
      amount: 4900,
      status: PaymentStatus.SUCCESSFUL,
    },
  });

  console.log(`Created payment: ${payment.id}`);

  // Create Download log
  const download = await prisma.download.create({
    data: {
      orderItemId: order.items[0].id,
      orderId: order.id,
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      metadata: { resolution: 'original' },
    },
  });

  console.log(`Created download record: ${download.id}`);
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

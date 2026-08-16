import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { EventStatus, PhotoProcessingStatus, OrderStatus } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/get-current-user';

const createOrderSchema = z.object({
  photoIds: z.array(z.string().min(1)).min(1, 'At least one photo must be selected.'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const { slug } = params;
    if (!slug) {
      return NextResponse.json({ error: 'Event slug is required.' }, { status: 400 });
    }

    // 1. Resolve Target Event (Must be PUBLISHED)
    const event = await prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        pricingType: true,
        pricePerPhoto: true,
        currency: true,
      },
    });

    if (!event || event.status !== EventStatus.PUBLISHED) {
      return NextResponse.json({ error: 'Event not found or unavailable.' }, { status: 404 });
    }

    // 2. Parse & Validate Payload
    const body = await req.json();
    const parseResult = createOrderSchema.safeParse(body);

    if (!parseResult.success) {
      const firstMsg = parseResult.error.issues[0]?.message || 'Invalid order payload.';
      return NextResponse.json({ error: firstMsg }, { status: 400 });
    }

    // Deduplicate photo IDs
    const requestedPhotoIds = Array.from(new Set(parseResult.data.photoIds));

    // 3. Fetch & Validate Selected EventPhoto records (Must belong to THIS Event and be READY)
    const validPhotos = await prisma.eventPhoto.findMany({
      where: {
        id: { in: requestedPhotoIds },
        eventId: event.id, // Strict photo ownership check (prevents cross-event photo manipulation)
        processingStatus: PhotoProcessingStatus.READY,
      },
      select: {
        id: true,
        originalKey: true,
        previewKey: true,
        thumbnailKey: true,
      },
    });

    if (validPhotos.length !== requestedPhotoIds.length) {
      return NextResponse.json(
        {
          error: 'INVALID_PHOTO_SELECTION',
          message: 'One or more selected photos do not exist, are not ready, or belong to another event.',
        },
        { status: 400 }
      );
    }

    // 4. Require Authenticated Server Session for Buyer Identity
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Please log in to create an order and save your photo selection.' },
        { status: 401 }
      );
    }
    const buyerId = user.id; // Strictly server-derived from authenticated JWT session

    // 5. Server Authoritative Price Calculation & Status Determination
    const isFree = event.pricingType === 'FREE';
    const unitPrice = isFree ? 0 : Math.max(0, event.pricePerPhoto);
    const subtotal = unitPrice * validPhotos.length;
    const total = subtotal;

    // FREE events resolve to COMPLETED immediately (no fake pending payment expectation)
    // PAID events resolve to PENDING (awaiting future payment phase)
    const initialOrderStatus = isFree ? OrderStatus.COMPLETED : OrderStatus.PENDING;

    // 6. Create Order & OrderItems atomically
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          eventId: event.id,
          buyerId, // Strictly server-derived
          status: initialOrderStatus,
          subtotal,
          total,
          currency: event.currency || 'THB',
          items: {
            create: validPhotos.map((photo) => ({
              photoId: photo.id,
              unitPrice, // Snapshot immutable unit price
            })),
          },
        },
        include: {
          items: {
            include: {
              photo: {
                select: {
                  id: true,
                  thumbnailKey: true,
                  previewKey: true,
                },
              },
            },
          },
        },
      });

      return newOrder;
    });

    return NextResponse.json(
      {
        message: 'Order created successfully',
        order: {
          id: order.id,
          eventId: order.eventId,
          eventSlug: event.slug,
          eventName: event.name,
          status: order.status,
          subtotal: order.subtotal,
          total: order.total,
          currency: order.currency,
          quantity: order.items.length,
          createdAt: order.createdAt.toISOString(),
          items: order.items.map((item) => ({
            id: item.id,
            photoId: item.photoId,
            unitPrice: item.unitPrice,
          })),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/public/events/[slug]/orders error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred while creating order.' },
      { status: 500 }
    );
  }
}

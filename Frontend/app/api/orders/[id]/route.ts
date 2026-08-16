import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/get-current-user';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Order ID is required.' }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        event: {
          select: {
            id: true,
            slug: true,
            name: true,
            creatorId: true,
            pricingType: true,
            pricePerPhoto: true,
            currency: true,
          },
        },
        items: {
          include: {
            photo: {
              select: {
                id: true,
                thumbnailKey: true,
                previewKey: true,
                width: true,
                height: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    // Strict Ownership Access Control: Require authenticated user
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (order.buyerId && user.id !== order.buyerId && user.id !== order.event.creatorId) {
      // Privacy-preserving 404 for unowned order
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({
      order: {
        id: order.id,
        eventId: order.eventId,
        eventSlug: order.event.slug,
        eventName: order.event.name,
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
          photo: {
            id: item.photo.id,
            width: item.photo.width,
            height: item.photo.height,
          },
        })),
      },
    });
  } catch (error: any) {
    console.error(`GET /api/orders/${params.id} error:`, error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred while fetching order.' },
      { status: 500 }
    );
  }
}

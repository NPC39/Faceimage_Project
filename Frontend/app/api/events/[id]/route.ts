import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { updateEventSchema } from '@/lib/validation/event';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = await prisma.event.findFirst({
      where: {
        id: params.id,
        creatorId: user.id, // Strictly verify ownership
      },
    });

    if (!event) {
      // Return 404 for non-existent OR unowned event (privacy protection)
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    console.error(`GET /api/events/${params.id} error:`, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching event.' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify event existence & ownership
    const existingEvent = await prisma.event.findFirst({
      where: {
        id: params.id,
        creatorId: user.id,
      },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await req.json();

    // Prevent explicit client overriding of immutable fields
    if (body.id !== undefined && body.id !== existingEvent.id) {
      return NextResponse.json({ error: 'Cannot modify event ID' }, { status: 400 });
    }
    if (body.creatorId !== undefined && body.creatorId !== existingEvent.creatorId) {
      return NextResponse.json({ error: 'Cannot modify event creatorId' }, { status: 400 });
    }

    const validationResult = updateEventSchema.safeParse(body);

    if (!validationResult.success) {
      const errorFormatted = validationResult.error.flatten().fieldErrors;
      const firstErrorMessage =
        validationResult.error.issues[0]?.message || 'Invalid event update data';

      return NextResponse.json(
        {
          error: firstErrorMessage,
          details: errorFormatted,
        },
        { status: 400 }
      );
    }

    const updateData = validationResult.data;

    // Disallow setting PROCESSING status manually
    if ((body.status as string) === 'PROCESSING') {
      return NextResponse.json(
        { error: 'PROCESSING status is system-controlled and cannot be manually selected' },
        { status: 400 }
      );
    }

    // Determine final pricing values
    const effectivePricingType = updateData.pricingType ?? existingEvent.pricingType;
    let finalPrice = existingEvent.pricePerPhoto;

    if (effectivePricingType === 'FREE') {
      finalPrice = 0;
    } else if (updateData.pricePerPhoto !== undefined) {
      finalPrice = updateData.pricePerPhoto < 100 && Number.isInteger(updateData.pricePerPhoto)
        ? Math.round(updateData.pricePerPhoto * 100)
        : Math.round(updateData.pricePerPhoto);
    }

    const updatedEvent = await prisma.event.update({
      where: {
        id: params.id,
      },
      data: {
        ...(updateData.name && { name: updateData.name }),
        ...(updateData.description !== undefined && { description: updateData.description || null }),
        ...(updateData.eventDate && { eventDate: new Date(updateData.eventDate) }),
        ...(updateData.pricingType && { pricingType: updateData.pricingType }),
        pricePerPhoto: finalPrice,
        ...(updateData.currency && { currency: updateData.currency }),
        ...(updateData.status && { status: updateData.status }),
      },
    });

    return NextResponse.json({
      message: 'Event updated successfully',
      event: updatedEvent,
    });
  } catch (error) {
    console.error(`PATCH /api/events/${params.id} error:`, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while updating event.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify event existence & ownership
    const existingEvent = await prisma.event.findFirst({
      where: {
        id: params.id,
        creatorId: user.id,
      },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    await prisma.event.delete({
      where: {
        id: params.id,
      },
    });

    return NextResponse.json({
      message: 'Event deleted successfully',
      deletedId: params.id,
    });
  } catch (error) {
    console.error(`DELETE /api/events/${params.id} error:`, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while deleting event.' },
      { status: 500 }
    );
  }
}

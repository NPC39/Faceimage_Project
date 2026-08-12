import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { createEventSchema } from '@/lib/validation/event';
import { generateUniqueSlug } from '@/lib/events/slug';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const events = await prisma.event.findMany({
      where: {
        creatorId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('GET /api/events error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while fetching events.' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validationResult = createEventSchema.safeParse(body);

    if (!validationResult.success) {
      const errorFormatted = validationResult.error.flatten().fieldErrors;
      const firstErrorMessage =
        validationResult.error.issues[0]?.message || 'Invalid event data';

      return NextResponse.json(
        {
          error: firstErrorMessage,
          details: errorFormatted,
        },
        { status: 400 }
      );
    }

    const { name, description, eventDate, pricingType, pricePerPhoto, currency } =
      validationResult.data;

    // Normalize price: FREE -> 0, PAID -> ensure integer minor units (satang or integer amount)
    // If input price is in THB (e.g., 49), store in satang (4900) if < 100, or exact integer minor unit.
    let finalPrice = 0;
    if (pricingType === 'PAID') {
      // If client sends minor units directly (e.g., 4900) or THB (e.g., 49), normalize to minor units
      finalPrice = pricePerPhoto < 100 && Number.isInteger(pricePerPhoto)
        ? Math.round(pricePerPhoto * 100)
        : Math.round(pricePerPhoto);
    }

    // Generate unique slug server-side
    const slug = await generateUniqueSlug(name);

    const newEvent = await prisma.event.create({
      data: {
        creatorId: user.id, // Strictly server-derived from authenticated session
        name,
        slug,
        description: description || null,
        eventDate: new Date(eventDate),
        pricingType,
        pricePerPhoto: finalPrice,
        currency: currency || 'THB',
        status: 'DRAFT',
      },
    });

    return NextResponse.json(
      {
        message: 'Event created successfully',
        event: newEvent,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /api/events error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while creating event.' },
      { status: 500 }
    );
  }
}

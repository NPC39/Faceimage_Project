import { NextRequest, NextResponse } from 'next/server';
import { searchEventFaces, FaceSearchError } from '@/lib/face-search/search-event-faces';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const slug = params.slug;
    if (!slug) {
      return NextResponse.json(
        { error: 'INVALID_SLUG', message: 'Event slug parameter is missing.' },
        { status: 400 }
      );
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'INVALID_CONTENT_TYPE', message: 'Request must be multipart/form-data.' },
        { status: 400 }
      );
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { error: 'INVALID_FORM_DATA', message: 'Failed to parse form data payload.' },
        { status: 400 }
      );
    }

    const file = (formData.get('selfie') || formData.get('file')) as File | null;
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json(
        { error: 'MISSING_SELFIE', message: 'No selfie image file provided in form data.' },
        { status: 400 }
      );
    }

    // Validate MIME type safely
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (file.type && !allowedMimeTypes.includes(file.type.toLowerCase())) {
      return NextResponse.json(
        { error: 'UNSUPPORTED_FORMAT', message: 'Unsupported image format. Allowed formats: JPEG, PNG, WebP.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const selfieBuffer = Buffer.from(arrayBuffer);

    if (selfieBuffer.length === 0) {
      return NextResponse.json(
        { error: 'EMPTY_FILE', message: 'Uploaded selfie payload is empty.' },
        { status: 400 }
      );
    }

    const searchResponse = await searchEventFaces(slug, selfieBuffer);

    return NextResponse.json(searchResponse, { status: 200 });
  } catch (err: any) {
    if (err instanceof FaceSearchError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode }
      );
    }

    console.error('[FaceSearchRouteError]', err);
    return NextResponse.json(
      { error: 'SEARCH_FAILED', message: 'An internal error occurred while processing face search.' },
      { status: 500 }
    );
  }
}

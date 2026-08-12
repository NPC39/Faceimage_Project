import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { prisma } from '@/lib/prisma';
import { PhotoManagerClient } from './photo-manager-client';

interface EventPhotosPageProps {
  params: {
    id: string;
  };
}

export default async function EventPhotosPage({ params }: EventPhotosPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      creatorId: user.id,
    },
  });

  if (!event) {
    notFound();
  }

  const initialPhotos = await prisma.eventPhoto.findMany({
    where: {
      eventId: event.id,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Convert Date objects to ISO strings for Client Component
  const formattedInitialPhotos = initialPhotos.map((p) => ({
    id: p.id,
    eventId: p.eventId,
    originalKey: p.originalKey,
    previewKey: p.previewKey,
    thumbnailKey: p.thumbnailKey,
    width: p.width,
    height: p.height,
    processingStatus: p.processingStatus,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <PhotoManagerClient
      event={{
        id: event.id,
        name: event.name,
        slug: event.slug,
      }}
      initialPhotos={formattedInitialPhotos}
    />
  );
}

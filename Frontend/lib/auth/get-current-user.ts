import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id && !session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: session.user.id ? { id: session.user.id } : { email: session.user.email ?? '' },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
}

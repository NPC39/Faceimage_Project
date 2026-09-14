import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendPasswordResetEmail } from '@/lib/email/send-password-reset';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email({ message: 'Invalid email address' }),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validationResult = forgotPasswordSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0]?.message || 'Invalid email address' },
        { status: 400 }
      );
    }

    const email = validationResult.data.email.toLowerCase().trim();

    // Check if user exists (generic response used regardless to prevent enumeration)
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Delete existing tokens for this email
      await prisma.passwordResetToken.deleteMany({
        where: { email },
      });

      // Generate raw token and SHA-256 hash
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

      // Store hashed token in database
      await prisma.passwordResetToken.create({
        data: {
          email,
          tokenHash,
          expiresAt,
        },
      });

      // Generate reset URL
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      // Dispatch / log reset email
      await sendPasswordResetEmail(email, resetUrl);

      const genericMessage =
        'If an account exists for this email, a password reset link has been generated.';

      if (process.env.NODE_ENV === 'development') {
        return NextResponse.json({
          message: genericMessage,
          resetUrl,
        });
      }

      return NextResponse.json({ message: genericMessage });
    }

    // Always return identical message even if user does not exist
    return NextResponse.json({
      message: 'If an account exists for this email, a password reset link has been generated.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred processing your request.' },
      { status: 500 }
    );
  }
}

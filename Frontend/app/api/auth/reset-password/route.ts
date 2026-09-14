import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, { message: 'Reset token is required' }),
    password: z.string().min(6, { message: 'Password must be at least 6 characters long' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validationResult = resetPasswordSchema.safeParse(body);

    if (!validationResult.success) {
      const firstErrorMessage =
        validationResult.error.issues[0]?.message || 'Invalid input provided';
      return NextResponse.json({ error: firstErrorMessage }, { status: 400 });
    }

    const { token, password } = validationResult.data;

    // SHA-256 hash the raw token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Locate matching reset token record
    const resetTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    const INVALID_TOKEN_MSG = 'This password reset link is invalid or has expired.';

    if (!resetTokenRecord) {
      return NextResponse.json({ error: INVALID_TOKEN_MSG }, { status: 400 });
    }

    // Check expiration
    if (resetTokenRecord.expiresAt < new Date()) {
      // Clean up expired token
      await prisma.passwordResetToken.delete({
        where: { id: resetTokenRecord.id },
      });
      return NextResponse.json({ error: INVALID_TOKEN_MSG }, { status: 400 });
    }

    // Locate user
    const user = await prisma.user.findUnique({
      where: { email: resetTokenRecord.email },
    });

    if (!user) {
      await prisma.passwordResetToken.deleteMany({
        where: { email: resetTokenRecord.email },
      });
      return NextResponse.json({ error: INVALID_TOKEN_MSG }, { status: 400 });
    }

    // Hash new password and update user
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Invalidate all tokens for this email (single-use requirement)
    await prisma.passwordResetToken.deleteMany({
      where: { email: resetTokenRecord.email },
    });

    return NextResponse.json(
      { message: 'Password updated successfully.' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while resetting your password.' },
      { status: 500 }
    );
  }
}

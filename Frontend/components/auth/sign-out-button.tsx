'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="gap-2 border-slate-700 hover:bg-rose-500/10 hover:border-rose-500/30 text-rose-400 hover:text-rose-300"
    >
      <LogOut className="h-4 w-4" />
      <span>Sign Out</span>
    </Button>
  );
}

'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { SignInPanel } from '@/components/auth/sign-in-panel';

export default function RegisterPage() {
  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 bg-zinc-950">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        }
      >
        <SignInPanel isRegister={true} />
      </Suspense>
    </div>
  );
}


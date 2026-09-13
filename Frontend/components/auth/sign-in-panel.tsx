'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Eye, EyeOff, Loader2, AlertCircle, Camera, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SignInPanel({ isRegister = false }: { isRegister?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isRegister) {
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email: email.trim(), password }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Registration failed. Please try again.');
          setLoading(false);
          return;
        }

        // Auto sign-in after registration
        const signInRes = await signIn('credentials', {
          email: email.trim(),
          password,
          redirect: false,
        });

        if (signInRes?.error) {
          setError('Account created, but sign-in failed. Please log in manually.');
          setLoading(false);
        } else {
          router.push(callbackUrl);
          router.refresh();
        }
      } catch (err) {
        setError('An unexpected error occurred. Please try again.');
        setLoading(false);
      }
    } else {
      try {
        const res = await signIn('credentials', {
          email: email.trim(),
          password,
          redirect: false,
        });

        if (res?.error) {
          setError('Invalid email or password.');
          setLoading(false);
        } else {
          router.push(callbackUrl);
          router.refresh();
        }
      } catch (err) {
        setError('An unexpected error occurred. Please try again.');
        setLoading(false);
      }
    }
  };

  return (
    <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-2xl my-8">
      {/* Left Form Panel */}
      <div className="p-8 sm:p-12 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-8">
            <div className="h-9 w-9 rounded-xl bg-zinc-100 text-zinc-900 flex items-center justify-center font-bold">
              <Camera className="h-5 w-5" />
            </div>
            <span className="font-extrabold text-lg text-zinc-100 tracking-tight">SnapMarket</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-100 tracking-tight mb-2">
            {isRegister ? 'Create an account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-zinc-400 mb-8">
            {isRegister
              ? 'Enter your details to register as a photographer or event creator.'
              : 'Sign in to access your event dashboards and photo collections.'}
          </p>

          {error && (
            <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-950/20 p-3.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5 uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-zinc-400 focus:outline-none transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-zinc-400 focus:outline-none transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider">
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 pr-10 text-sm text-white placeholder-zinc-500 focus:border-zinc-400 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-4 h-11 text-sm font-semibold rounded-xl"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>{isRegister ? 'Creating Account...' : 'Signing in...'}</span>
                </>
              ) : (
                <>
                  <span>{isRegister ? 'Create Account' : 'Sign In'}</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </form>
        </div>

        <div className="mt-8 text-center text-xs text-zinc-500">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <Link href="/login" className="font-semibold text-zinc-200 hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-semibold text-zinc-200 hover:underline">
                Register as Creator
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Right Photography Visual Panel */}
      <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-b from-zinc-900 to-zinc-950 border-l border-zinc-800/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.05),transparent_50%)] pointer-events-none" />

        <div className="relative z-10 space-y-6 my-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300">
            <Camera className="h-3.5 w-3.5 text-zinc-100" />
            <span>Photography Studio Platform</span>
          </div>

          <h3 className="text-3xl font-bold text-zinc-100 tracking-tight leading-tight text-editorial">
            Minimal, instant photo discovery for events.
          </h3>

          <div className="space-y-3 pt-2 text-xs text-zinc-400">
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-200">
                <Check className="h-3 w-3" />
              </div>
              <span>Instant facial recognition matching for event attendees</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-200">
                <Check className="h-3 w-3" />
              </div>
              <span>Watermarked gallery previews with flexible pricing options</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="h-5 w-5 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 text-zinc-200">
                <Check className="h-3 w-3" />
              </div>
              <span>Direct high-resolution original image downloads</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 border-t border-zinc-800/80 pt-4 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <span>DES400 Senior Project</span>
          <span>Phase 1 Verified</span>
        </div>
      </div>
    </div>
  );
}

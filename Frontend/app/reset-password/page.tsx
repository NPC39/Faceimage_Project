'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, Eye, EyeOff, ArrowRight, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('This password reset link is invalid or missing a token.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'This password reset link is invalid or has expired.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);

      // Redirect to /login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
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
            Reset your password
          </h2>
          <p className="text-sm text-zinc-400 mb-8">
            Enter your new password below to update your account credentials.
          </p>

          {error && (
            <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-950/20 p-3.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs text-emerald-300 space-y-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="font-semibold text-sm">Password updated successfully.</span>
              </div>
              <p className="text-zinc-400">
                Redirecting you to the sign-in page...
              </p>
              <Button
                onClick={() => router.push('/login')}
                className="w-full mt-2 h-10 text-xs font-semibold rounded-xl"
              >
                Go to Sign In Now
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5 uppercase tracking-wider">
                  New Password
                </label>
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

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5 uppercase tracking-wider">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                    <span>Resetting Password...</span>
                  </>
                ) : (
                  <>
                    <span>Reset Password</span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </form>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-zinc-500">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 font-semibold text-zinc-200 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Sign In</span>
          </Link>
        </div>
      </div>

      {/* Right Visual Panel */}
      <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-b from-zinc-900 to-zinc-950 border-l border-zinc-800/80 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.05),transparent_50%)] pointer-events-none" />

        <div className="relative z-10 space-y-6 my-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300">
            <Camera className="h-3.5 w-3.5 text-zinc-100" />
            <span>Password Security</span>
          </div>

          <h3 className="text-3xl font-bold text-zinc-100 tracking-tight leading-tight">
            Create a strong, secure new password.
          </h3>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Your new password must be at least 6 characters long and will be securely hashed with bcrypt before saving.
          </p>
        </div>

        <div className="relative z-10 border-t border-zinc-800/80 pt-4 flex items-center justify-between text-xs text-zinc-500 font-mono">
          <span>DES400 Senior Project</span>
          <span>Password Reset</span>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading...</span>
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}

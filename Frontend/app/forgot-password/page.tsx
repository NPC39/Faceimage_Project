'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Camera, ArrowRight, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [devResetUrl, setDevResetUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setDevResetUrl('');
    setLoading(true);

    if (!email.trim()) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to request password reset. Please try again.');
        setLoading(false);
        return;
      }

      setMessage(data.message || 'If an account exists for this email, a password reset link has been generated.');
      if (data.resetUrl) {
        setDevResetUrl(data.resetUrl);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black flex items-center justify-center p-4 sm:p-6 lg:p-8">
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
              Forgot your password?
            </h2>
            <p className="text-sm text-zinc-400 mb-8">
              Enter your email and we&apos;ll help you reset your password.
            </p>

            {error && (
              <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-950/20 p-3.5 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {message && (
              <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-xs text-emerald-300 space-y-2">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>{message}</span>
                </div>
                {devResetUrl && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20">
                    <p className="font-semibold text-emerald-200 mb-1">Development Quick Link:</p>
                    <a
                      href={devResetUrl}
                      className="underline text-emerald-400 hover:text-emerald-200 break-all font-mono"
                    >
                      {devResetUrl}
                    </a>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
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

              <Button
                type="submit"
                disabled={loading}
                className="w-full mt-4 h-11 text-sm font-semibold rounded-xl"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>Sending Reset Link...</span>
                  </>
                ) : (
                  <>
                    <span>Send Reset Link</span>
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </form>
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
              <span>Account Recovery</span>
            </div>

            <h3 className="text-3xl font-bold text-zinc-100 tracking-tight leading-tight">
              Secure & seamless password recovery.
            </h3>

            <p className="text-xs text-zinc-400 leading-relaxed">
              We send cryptographically secure, single-use password reset tokens to ensure your photography event collections and account data stay safe.
            </p>
          </div>

          <div className="relative z-10 border-t border-zinc-800/80 pt-4 flex items-center justify-between text-xs text-zinc-500 font-mono">
            <span>DES400 Senior Project</span>
            <span>Password Reset</span>
          </div>
        </div>
      </div>
    </main>
  );
}

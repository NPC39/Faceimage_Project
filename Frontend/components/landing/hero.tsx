'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Search, Camera, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackgroundPaths } from '@/components/ui/background-paths';

export function LandingHero() {
  return (
    <BackgroundPaths className="relative pt-16 pb-20 md:pt-28 md:pb-32 px-4 sm:px-6 lg:px-8 border-b border-zinc-900">
      <div className="max-w-6xl mx-auto text-center">
        {/* Subtle Pill Tag */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs font-medium text-zinc-300 backdrop-blur-md mb-8"
        >
          <Sparkles className="h-3.5 w-3.5 text-zinc-100" />
          <span>Facial Recognition Photo Discovery</span>
        </motion.div>

        {/* Editorial Title */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.08] text-editorial"
        >
          Find yourself <br className="hidden sm:inline" />
          <span className="text-zinc-400">in every moment.</span>
        </motion.h1>

        {/* Editorial Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed"
        >
          Discover event photos using a selfie — without scrolling through thousands of images.
        </motion.p>

        {/* Call to Actions */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto gap-2.5 shadow-2xl px-8 h-12 text-base">
              <Search className="h-4 w-4 shrink-0" />
              <span>Find My Photos</span>
              <ArrowRight className="h-4 w-4 opacity-70 ml-1" />
            </Button>
          </Link>

          <Link href="/dashboard/events/new" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2.5 h-12 text-base">
              <Camera className="h-4 w-4 shrink-0" />
              <span>For Photographers</span>
            </Button>
          </Link>
        </motion.div>

        {/* Photography Surface Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-16 relative mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 sm:p-4 shadow-2xl backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4 px-2">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
            </div>
            <span className="text-xs text-zinc-500 font-mono">snapmarket.app/event/marathon-2026</span>
            <span className="text-[11px] font-mono text-zinc-400 border border-zinc-800 rounded-md px-2 py-0.5">
              100% Precision Match
            </span>
          </div>

          {/* Minimal 3-Step Interactive Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left p-1">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-4 transition-all hover:border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-zinc-400 font-mono">01 / UPLOAD</span>
                <Camera className="h-4 w-4 text-zinc-500" />
              </div>
              <h3 className="font-semibold text-zinc-100 text-sm">Host Event Album</h3>
              <p className="text-xs text-zinc-400 mt-1">Organizers batch upload photos. AI extracts 512D face embeddings automatically.</p>
            </div>

            <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-lg transition-all">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-zinc-200 font-mono">02 / SEARCH</span>
                <Zap className="h-4 w-4 text-zinc-200" />
              </div>
              <h3 className="font-semibold text-zinc-100 text-sm">Take a Selfie</h3>
              <p className="text-xs text-zinc-300 mt-1">Attendees capture a selfie to instantly find their matching photos in seconds.</p>
            </div>

            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-4 transition-all hover:border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-zinc-400 font-mono">03 / DOWNLOAD</span>
                <ShieldCheck className="h-4 w-4 text-zinc-500" />
              </div>
              <h3 className="font-semibold text-zinc-100 text-sm">Select & Download</h3>
              <p className="text-xs text-zinc-400 mt-1">Preview watermarked grid & unlock high-res originals via free or paid access.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </BackgroundPaths>
  );
}

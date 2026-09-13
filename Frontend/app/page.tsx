import Link from "next/link";
import { 
  Camera, 
  Search, 
  ShieldCheck, 
  Zap, 
  DollarSign, 
  CheckCircle2, 
  ArrowRight 
} from "lucide-react";
import { LandingHero } from "@/components/landing/hero";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="relative bg-zinc-950 text-zinc-100">
      {/* Editorial Hero Component */}
      <LandingHero />

      {/* Product Workflow Section */}
      <section id="how-it-works" className="py-24 border-b border-zinc-900 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest font-mono">
            How It Works
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-zinc-100 mt-3 tracking-tight text-editorial">
            Designed for instant photo discovery.
          </h2>
          <p className="mt-4 text-zinc-400 text-base">
            No more manual searching through thousands of unorganized photos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3 p-6 rounded-2xl border border-zinc-900 bg-zinc-900/40">
            <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-100 font-bold text-sm font-mono">
              01
            </div>
            <h3 className="font-bold text-lg text-zinc-100">Open Event Link</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Scan a QR code or click an event link shared by the photographer.
            </p>
          </div>

          <div className="space-y-3 p-6 rounded-2xl border border-zinc-900 bg-zinc-900/40">
            <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-100 font-bold text-sm font-mono">
              02
            </div>
            <h3 className="font-bold text-lg text-zinc-100">Take a Selfie</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Snap a quick photo or upload a portrait from your camera roll.
            </p>
          </div>

          <div className="space-y-3 p-6 rounded-2xl border border-zinc-900 bg-zinc-900/40">
            <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-100 font-bold text-sm font-mono">
              03
            </div>
            <h3 className="font-bold text-lg text-zinc-100">Instant Matching</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              InsightFace ArcFace matches your facial embedding in sub-seconds.
            </p>
          </div>

          <div className="space-y-3 p-6 rounded-2xl border border-zinc-900 bg-zinc-900/40">
            <div className="h-10 w-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-100 font-bold text-sm font-mono">
              04
            </div>
            <h3 className="font-bold text-lg text-zinc-100">Select & Download</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Preview watermarked photos and instantly unlock high-res originals.
            </p>
          </div>
        </div>
      </section>

      {/* For Photographers Section */}
      <section id="photographers" className="py-24 border-b border-zinc-900 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-widest font-mono">
              For Photographers & Creators
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-zinc-100 mt-3 tracking-tight text-editorial">
              Effortless hosting. <br /> Instant attendee access.
            </h2>
            <p className="mt-4 text-zinc-400 text-sm leading-relaxed">
              Host marathon, wedding, festival, or studio photo albums. Set custom per-photo pricing or offer free original downloads with high-precision face indexing.
            </p>

            <div className="mt-6 space-y-3 text-xs text-zinc-300">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-zinc-100 shrink-0" />
                <span>Batch upload hundreds of photos simultaneously</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-zinc-100 shrink-0" />
                <span>Automated face detection and embedding vector indexing</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-zinc-100 shrink-0" />
                <span>Secure Cloudflare R2 presigned original photo downloads</span>
              </div>
            </div>

            <div className="mt-8">
              <Link href="/dashboard/events/new">
                <Button size="lg" className="gap-2 text-sm font-semibold">
                  <Camera className="h-4 w-4" />
                  <span>Create Your First Event</span>
                  <ArrowRight className="h-4 w-4 opacity-70" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-xs font-mono text-zinc-400">Creator Performance Overview</span>
              <span className="text-xs font-mono text-zinc-300">Event #2026-LIVE</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60">
                <div className="text-2xl font-extrabold text-zinc-100 font-mono">1,420</div>
                <div className="text-xs text-zinc-500 mt-1">Photos Indexed</div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60">
                <div className="text-2xl font-extrabold text-zinc-100 font-mono">100.0%</div>
                <div className="text-xs text-zinc-500 mt-1">Identity Precision</div>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 text-xs text-zinc-400">
              <span className="text-zinc-200 font-semibold">Multi-Face Ambiguity Guard:</span> Active with 0 false positives verified across production datasets.
            </div>
          </div>
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl font-extrabold text-zinc-100 text-editorial">
            Ready to find your photos?
          </h2>
          <p className="text-zinc-400 text-sm">
            Open an event link or log in to manage your photo collections.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <Link href="/dashboard">
              <Button size="lg" className="px-8 h-12 text-sm font-semibold">
                Go to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}


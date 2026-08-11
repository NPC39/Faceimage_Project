import Link from "next/link";
import { 
  Camera, 
  Sparkles, 
  Search, 
  DollarSign, 
  ShieldCheck, 
  Zap, 
  ArrowRight, 
  UploadCloud, 
  CheckCircle2, 
  ImageIcon,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* Hero Glow Background Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[600px] bg-hero-glow pointer-events-none -z-10" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-40 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 md:pt-32 md:pb-36 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <Badge variant="gradient" className="mb-6 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider gap-2">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          AI-Powered Graduation Project Phase 1
        </Badge>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.1]">
          Find & Monetize Event Photos with{" "}
          <span className="text-gradient">AI Face Recognition</span>
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed font-normal">
          Upload event photo albums, share a custom event link, and allow attendees to find their exact photos in seconds using quick selfie recognition. Pay-per-photo instant monetization.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/dashboard">
            <Button size="lg" className="w-full sm:w-auto gap-2.5 shadow-xl shadow-indigo-500/20 text-base">
              <Camera className="h-5 w-5" />
              <span>Create Photo Event</span>
              <ArrowRight className="h-4 w-4 opacity-80" />
            </Button>
          </Link>

          <Link href="/dashboard">
            <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2.5 text-base border-slate-700">
              <Search className="h-5 w-5 text-indigo-400" />
              <span>Find My Event Photos</span>
            </Button>
          </Link>
        </div>

        {/* Feature Highlights Pills */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-slate-400 font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Instant Facial Matching</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Watermarked Grid Previews</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Pay-Per-Photo Micro-transactions</span>
          </div>
        </div>

        {/* Interactive Mockup Preview */}
        <div className="mt-16 relative mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4 px-2">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-xs text-slate-400 font-mono">snapmarket.ai/event/marathon-2026</span>
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">System Ready</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left p-2">
            {/* Step 1 Preview Card */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-indigo-400 font-mono">STEP 01</span>
                <UploadCloud className="h-5 w-5 text-slate-400" />
              </div>
              <h4 className="font-semibold text-white text-sm">Upload Album</h4>
              <p className="text-xs text-slate-400 mt-1">Organizers batch upload event photos into a secure repository.</p>
              <div className="mt-4 rounded-lg bg-slate-900 border border-slate-800 p-3 text-center">
                <ImageIcon className="h-8 w-8 text-indigo-400/60 mx-auto mb-1" />
                <span className="text-[11px] text-slate-400 font-mono">1,420 Photos Uploaded</span>
              </div>
            </div>

            {/* Step 2 Preview Card */}
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 relative overflow-hidden group shadow-lg shadow-indigo-500/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-pink-400 font-mono">STEP 02</span>
                <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
              </div>
              <h4 className="font-semibold text-white text-sm">Upload Selfie</h4>
              <p className="text-xs text-slate-300 mt-1">Attendees take a selfie to generate a high-precision face embedding vector.</p>
              <div className="mt-4 rounded-lg bg-slate-900/90 border border-indigo-500/40 p-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs">
                  AI
                </div>
                <div>
                  <div className="text-xs font-medium text-white">99.4% Match Found</div>
                  <div className="text-[10px] font-mono text-emerald-400">14 Photos Detected</div>
                </div>
              </div>
            </div>

            {/* Step 3 Preview Card */}
            <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 relative overflow-hidden group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-emerald-400 font-mono">STEP 03</span>
                <DollarSign className="h-5 w-5 text-slate-400" />
              </div>
              <h4 className="font-semibold text-white text-sm">Purchase & Download</h4>
              <p className="text-xs text-slate-400 mt-1">Customers preview watermarked photos & unlock original high-res downloads.</p>
              <div className="mt-4 rounded-lg bg-slate-900 border border-slate-800 p-3 flex items-center justify-between">
                <span className="text-xs text-slate-300 font-medium">$2.99 / photo</span>
                <Button size="sm" variant="default" className="h-7 text-xs px-2.5">Buy Selected</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Section */}
      <section id="features" className="py-20 border-t border-slate-800/60 bg-slate-950/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-3 text-indigo-400 border-indigo-500/30">Features Overview</Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
              Built for Photographers, Event Organizers & Guests
            </h2>
            <p className="mt-4 text-slate-400 text-base">
              Say goodbye to scrolling manually through thousands of unorganized photos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="hover:border-indigo-500/50 transition-colors">
              <CardHeader>
                <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
                  <Zap className="h-6 w-6" />
                </div>
                <CardTitle>InsightFace Recognition</CardTitle>
                <CardDescription className="mt-2 text-slate-400">
                  State-of-the-art Deep Learning facial embedding comparison running on Python FastAPI engine.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:border-purple-500/50 transition-colors">
              <CardHeader>
                <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
                  <DollarSign className="h-6 w-6" />
                </div>
                <CardTitle>Pay-Per-Photo Revenue</CardTitle>
                <CardDescription className="mt-2 text-slate-400">
                  Organizers easily set custom prices per photograph and earn direct revenue per event.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="hover:border-pink-500/50 transition-colors">
              <CardHeader>
                <div className="h-12 w-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-4">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <CardTitle>Watermark Protection</CardTitle>
                <CardDescription className="mt-2 text-slate-400">
                  Dynamic digital watermarks prevent unauthorized downloads before purchase completion.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

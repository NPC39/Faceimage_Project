import Link from "next/link";
import { 
  Camera, 
  Plus, 
  Calendar, 
  MapPin, 
  Image as ImageIcon, 
  TrendingUp, 
  DollarSign, 
  Users, 
  CheckCircle,
  Activity,
  ArrowUpRight,
  UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  const sampleEvents = [
    {
      id: "evt-101",
      title: "University Graduation Ceremony 2026",
      date: "August 15, 2026",
      location: "Main Auditorium",
      photos: 850,
      matches: 340,
      price: "$3.50",
      status: "Active",
    },
    {
      id: "evt-102",
      title: "Campus City Marathon 2026",
      date: "July 28, 2026",
      location: "Central Park Stadium",
      photos: 2400,
      matches: 1120,
      price: "$2.99",
      status: "Active",
    },
    {
      id: "evt-103",
      title: "Computer Science Tech Symposium",
      date: "June 10, 2026",
      location: "Engineering Complex B",
      photos: 420,
      matches: 180,
      price: "$4.00",
      status: "Completed",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Welcome, {user?.name || "Creator"}
            </h1>
            <Badge variant="gradient" className="text-xs">Phase 3 Authenticated</Badge>
          </div>
          <p className="text-slate-400 text-sm mt-1 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-emerald-400" />
            <span>Signed in as <strong className="text-slate-200">{user?.email || "Authenticated User"}</strong></span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="gap-2 border-slate-700">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span>FastAPI: Connected</span>
          </Button>
          <SignOutButton />
          <Button variant="default" size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-500">
            <Plus className="h-4 w-4" />
            <span>Create New Event</span>
          </Button>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-8">
        <Card className="bg-slate-900/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Events
            </CardTitle>
            <Calendar className="h-4 w-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">3</div>
            <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1 font-medium">
              <TrendingUp className="h-3 w-3" /> +1 this month
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Photos Hosted
            </CardTitle>
            <ImageIcon className="h-4 w-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">3,670</div>
            <p className="text-xs text-slate-400 mt-1">Across 3 photo albums</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              AI Face Matches
            </CardTitle>
            <Users className="h-4 w-4 text-pink-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">1,640</div>
            <p className="text-xs text-emerald-400 flex items-center gap-1 mt-1 font-medium">
              <CheckCircle className="h-3 w-3" /> 98.6% Accuracy Rate
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Estimated Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">$1,428.50</div>
            <p className="text-xs text-slate-400 mt-1">Pay-per-photo earnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Events List */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Your Photo Events</h2>
          <Button variant="ghost" size="sm" className="text-xs text-indigo-400 hover:text-indigo-300">
            View All
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {sampleEvents.map((evt) => (
            <Card key={evt.id} className="relative group overflow-hidden border-slate-800 hover:border-indigo-500/40">
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <Badge variant={evt.status === "Active" ? "default" : "secondary"}>
                    {evt.status}
                  </Badge>
                  <span className="text-xs font-mono text-slate-400">{evt.price} / photo</span>
                </div>
                <CardTitle className="text-base group-hover:text-indigo-300 transition-colors">
                  {evt.title}
                </CardTitle>
                <CardDescription className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                  <Calendar className="h-3.5 w-3.5" /> {evt.date}
                </CardDescription>
                <CardDescription className="flex items-center gap-1 text-xs text-slate-400">
                  <MapPin className="h-3.5 w-3.5" /> {evt.location}
                </CardDescription>
              </CardHeader>

              <CardContent className="border-t border-slate-800/80 pt-4 flex items-center justify-between text-xs text-slate-300">
                <div>
                  <span className="font-semibold text-white">{evt.photos}</span> photos
                </div>
                <div className="text-indigo-400 font-medium">
                  {evt.matches} face matches
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Status Banner */}
      <div className="mt-12 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-white">Phase 3 Authentication Active</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              User identity <code className="text-indigo-300 font-mono">{user?.id}</code> verified server-side. NextAuth session protection enabled for /dashboard routes.
            </p>
          </div>
        </div>

        <Link href="/">
          <Button variant="outline" size="sm" className="whitespace-nowrap border-indigo-500/40 text-indigo-300">
            Back to Home Page
          </Button>
        </Link>
      </div>
    </div>
  );
}

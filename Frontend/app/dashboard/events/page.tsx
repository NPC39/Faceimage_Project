import React from 'react';
import { Calendar } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { EmptyState } from '@/components/dashboard/empty-state';

export default function EventsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <DashboardHeader
        heading="Events"
        subheading="Create and manage your photo events."
      />

      {/* Main Content Area - Empty State */}
      <div className="pt-2">
        <EmptyState
          icon={Calendar}
          title="No events yet"
          description="Your photo events will appear here once event creation is available."
        />
      </div>
    </div>
  );
}

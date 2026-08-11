import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';
import { EmptyState } from '@/components/dashboard/empty-state';

export default function OrdersPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <DashboardHeader
        heading="Orders"
        subheading="Track purchases from your photo events."
      />

      {/* Main Content Area - Empty State */}
      <div className="pt-2">
        <EmptyState
          icon={ShoppingBag}
          title="No orders yet"
          description="Orders will appear here after customers purchase photos from your events."
        />
      </div>
    </div>
  );
}

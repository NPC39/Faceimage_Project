# Creator Dashboard UI Foundation

This document outlines the architecture and design of the Creator Dashboard UI foundation introduced in Phase 4.

## Route Structure

- `/dashboard`: Main Overview page displaying welcome section, summary metric cards, recent event/order empty states, and auth identity badge.
- `/dashboard/events`: Events page foundation introducing event creator workflow.
- `/dashboard/orders`: Orders page foundation introducing event sales and order tracking.

All `/dashboard` routes are protected server-side via NextAuth middleware (`middleware.ts`) and wrap children inside the authenticated layout.

## Layout & Navigation Architecture

### Reusable Layout (`Frontend/app/dashboard/layout.tsx`)
- Fetches authenticated user details using `getCurrentUser()`.
- Renders responsive two-column grid:
  - Desktop: Fixed sidebar (`w-64`).
  - Mobile (< `768px`): Compact top bar with mobile navigation drawer toggle.

### Sidebar Navigation (`components/dashboard/dashboard-sidebar.tsx`)
- Displays product logo (`SnapMarket.AI Creator Hub`).
- Contextual navigation links with active state highlighting (`usePathname()`).
- Direct link back to public homepage (`/`).
- Bottom user profile area displaying safe user identity (name, email) and NextAuth `signOut` action button.

### Mobile Navigation (`components/dashboard/dashboard-mobile-nav.tsx`)
- Slide-over backdrop drawer accessible on mobile devices (tested down to 375px width).
- Closes automatically on route selection.

## Component Organization

All dashboard-specific presentation components reside in `Frontend/components/dashboard/`:

- `dashboard-sidebar.tsx`: Desktop sidebar component.
- `dashboard-mobile-nav.tsx`: Mobile header & menu drawer component.
- `dashboard-header.tsx`: Page context header.
- `stat-card.tsx`: Metric card component.
- `empty-state.tsx`: Standardized empty state card.

## Phase Boundaries & Deferred Capabilities

The Phase 4 Creator Dashboard establishes UI layout and navigation foundations. The following capabilities are intentionally deferred to future implementation phases:

- **Phase 5**: Event CRUD (creating, editing, and deleting photo events, `/dashboard/events/new`).
- **Phase 6**: Photo upload and storage pipeline.
- **Phase 7–9**: AI Face Recognition, processing pipeline, and face search.
- **Phase 13**: Order processing, cart, and order management.
- **Phase 14**: Payment gateway integration.
- **Phase 16**: Real database analytics, revenue charts, and aggregate sales reports.

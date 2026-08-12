# Creator Dashboard Architecture

This document outlines the architecture and design of the Creator Dashboard, updated for Phase 5 Event CRUD integration.

## Route Structure

- `/dashboard`: Main Overview page displaying welcome section, real summary metric cards (`Total Events` and `Total Photos` connected to live PostgreSQL queries), recent events list, and auth identity badge.
- `/dashboard/events`: Events management page listing all photo events created by the logged-in user with real photo counts. Displays `EmptyState` with a direct link to create an event if 0 events exist.
- `/dashboard/events/new`: Event creation page with server-validated form (name, description, date, pricing model, currency).
- `/dashboard/events/[id]`: Event overview page showing metadata, status, pricing, public URL slug (`/event/[slug]`), real photo count, active "Manage Photos" action, and settings action link.
- `/dashboard/events/[id]/photos`: Photo management page allowing creators to drag & drop upload images, view real-time progress, retry failed uploads, view photo grid thumbnails, and delete photos.
- `/dashboard/events/[id]/settings`: Event settings page allowing creators to update details, toggle status (`DRAFT`, `PUBLISHED`, `ARCHIVED`), and permanently delete events.
- `/dashboard/orders`: Orders page foundation introducing event sales and order tracking (Phase 13).

All `/dashboard` routes are protected server-side via NextAuth session validation and `getCurrentUser()`.

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
- `event-card.tsx`: Real Event presentation card component displaying name, date, status, FREE/PAID price, photo count, and manage action link.

## Phase Integration & Boundaries

- **Phase 5 (Active)**: Full Event CRUD management, real event count on overview, recent event list, unique slug generation, server-authoritative ownership.
- **Phase 6 (Active)**: Full photo upload system, private storage, variant generation (preview/thumbnail), photo management route, real photo counts on dashboard.
- **Phase 7–9**: AI Face Recognition, processing pipeline, and face search.
- **Phase 13**: Order processing, cart, and order management.
- **Phase 14**: Payment gateway integration.
- **Phase 16**: Real database analytics, revenue charts, and aggregate sales reports.

# Event Management Architecture (Phase 5)

## Overview

Phase 5 introduces full server-side Event CRUD management for authenticated users on the Creator Dashboard.

## Event Ownership Model

- **Rule**: Any authenticated user can create photo events.
- **Role Model**: There are no static permanent user roles (e.g. Photographer, Customer, Admin).
- **Ownership Verification**: Determined strictly server-side by checking:
  ```ts
  event.creatorId === currentUser.id
  ```
- **Security Principle**: Never trust `creatorId` sent in the payload from the client. The authenticated session via `getCurrentUser()` is authoritative.
- **Privacy Policy**: Cross-user access attempts (e.g., User B attempting to view/edit/delete User A's event) return `404 Not Found` rather than `403 Forbidden` to prevent revealing the existence of private events belonging to other creators.

## Routes

| Route | Type | Description |
| :--- | :--- | :--- |
| `/dashboard/events` | Server Page | Lists all events owned by current user with real photo counts. Displays honest empty state if 0 events exist. |
| `/dashboard/events/new` | Client Page | Production form to create a new photo event. |
| `/dashboard/events/[id]` | Server Page | Event detail overview displaying metadata, status, pricing, real photo count, and active public share URL (`/event/[slug]`). |
| `/event/[slug]` | Server Page | Public customer event storefront displaying event details, pricing, available photo count, and face search CTA (Phase 10). |

| `/dashboard/events/[id]/photos` | Server/Client | Drag & Drop multi-photo upload management page with real-time progress, retry, thumbnail grid, and photo deletion. |
| `/dashboard/events/[id]/settings` | Client Page | Edit event details, update status (`DRAFT`, `PUBLISHED`, `ARCHIVED`), and permanently delete event. |
| `/api/events` | Route Handler | `GET` (list owned events), `POST` (create event for session user). |
| `/api/events/[id]` | Route Handler | `GET` (fetch single event), `PATCH` (update owned event), `DELETE` (delete owned event). |
| `/api/events/[id]/photos` | Route Handler | `GET` (list photos for owned event), `POST` (upload & process event photos). |
| `/api/events/[id]/photos/[photoId]` | Route Handler | `DELETE` (delete photo record and storage files). |
| `/api/events/[id]/photos/[photoId]/[variant]` | Route Handler | `GET` (serve private thumbnail, preview, or original image variant). |

## Slug Generation Strategy

- Server-generated upon creation using `generateUniqueSlug(name)` in `lib/events/slug.ts`.
- Format: `[slugified-name]-[short-hex-suffix]` (e.g., `graduation-2026-a8f3c2`).
- Uniqueness: Verified against PostgreSQL database before insertion with automatic retry fallback.
- Immutability: Slugs remain stable after creation and are not regenerated on name edits to preserve shareable URLs.

## Pricing & Money Representation

- **FREE Events**: `pricingType: 'FREE'`, `pricePerPhoto: 0`.
- **PAID Events**: `pricingType: 'PAID'`, `pricePerPhoto: > 0`.
- **Minor Unit Integer Standard**: Money is stored as an integer minor unit (e.g. 4900 satang = ฿49.00 THB). Floating point numbers are strictly avoided in database storage.
- **Default Currency**: `THB`.

## Event Status Lifecycle

- `DRAFT`: Newly created events. Hidden from public storefront.
- `PUBLISHED`: Active event. Ready for public sharing.
- `ARCHIVED`: Closed event.
- `PROCESSING`: System-controlled status reserved for automated background photo processing in Phase 8. Disallowed from manual selection in user UI.

## Phase Boundary Enforcements

- Photo upload & gallery management -> **Phase 6**
- Face recognition & embedding pipeline -> **Phase 7**
- Photo processing & watermark pipeline -> **Phase 8**
- Face search API -> **Phase 9**
- Public storefront experience -> **Phase 10**
- Orders & Checkout -> **Phase 13**
- Payment gateway integration -> **Phase 14**
- Real analytics -> **Phase 16**

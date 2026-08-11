# Authentication Architecture Documentation

This document describes the authentication system implemented in Phase 3 for the **Face Recognition Photo Marketplace** application.

---

## 1. Authentication Strategy Overview

- **Framework**: NextAuth.js v4 (`next-auth`) with Next.js 14 App Router.
- **Provider**: Credentials Provider (Email & Password).
- **Password Hashing**: `bcryptjs` with salt factor 10.
- **Session Strategy**: Stateless JWT Session (`session: { strategy: "jwt" }`).
- **Database ORM**: Prisma ORM with PostgreSQL 16.

---

## 2. System Role Architecture

The application enforces a **unified User model**. Every registered account is stored as a `User`.
- There are **no rigid roles** (e.g. Photographer, Customer, Admin).
- Any authenticated `User` can organize photo events or purchase photos from existing events.

---

## 3. Core Authentication Workflows

### 3.1 Registration Flow (`/register` & `/api/auth/register`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Client Browser
    participant API as /api/auth/register
    participant DB as PostgreSQL DB (Prisma)

    User->>API: POST { name, email, password, confirmPassword }
    API->>API: 1. Validate payload with Zod
    API->>API: 2. Normalize email (lowercase & trim)
    API->>DB: 3. Query existing user by email
    alt Email Already Exists
        DB-->>API: Existing User Record
        API-->>User: 409 Conflict ("An account with this email address already exists.")
    else Email Unique
        API->>API: 4. Hash password using bcrypt (salt=10)
        API->>DB: 5. Create User (name, email, passwordHash)
        DB-->>API: New User (id, name, email)
        API-->>User: 201 Created (safe user payload, excluding passwordHash)
    end
```

### 3.2 Login Flow (`/login` & `/api/auth/[...nextauth]`)

1. User submits email and password at `/login`.
2. `signIn('credentials', { email, password, redirect: false })` invokes NextAuth's `authorize` callback.
3. The callback normalizes the email, searches PostgreSQL for `User`, and verifies `bcrypt.compare(password, user.passwordHash)`.
4. If valid, NextAuth generates a signed JWT token containing `{ id, name, email }`.
5. On invalid email or password, a generic error message (`"Invalid email or password."`) is returned to prevent user enumeration attacks.

---

## 4. Security & Privacy Controls

| Security Dimension | Implementation Detail |
| :--- | :--- |
| **Password Storage** | Hashed with `bcryptjs` (cost factor 10). Plaintext passwords are never saved. |
| **Password Hash Leak Prevention** | `passwordHash` is excluded from Prisma API selections and NextAuth JWT/Session payloads. |
| **Email Normalization** | Emails are converted to lowercase and trimmed before DB queries and writes. |
| **Input Validation** | Server-side validation via `zod` schemas (`name` >= 2 chars, valid email, `password` >= 6 chars). |
| **Session Protection** | Encrypted JWT cookie signed with `NEXTAUTH_SECRET`. |
| **Server-side Authorization** | Protected routes extract identity from server session; client-provided user IDs are never trusted. |

---

## 5. Protected Routes & Middleware

- **Protected Path**: `/dashboard` and `/dashboard/*`.
- **Middleware**: Defined in [`Frontend/middleware.ts`](file:///Users/nppn/Desktop/Project/Frontend/middleware.ts) using NextAuth `withAuth`.
- **Behavior**: Unauthenticated requests to `/dashboard` are automatically intercepted server-side and redirected to `/login?callbackUrl=/dashboard`.

---

## 6. Server-Side Current User Helper (`getCurrentUser`)

Located in [`Frontend/lib/auth/get-current-user.ts`](file:///Users/nppn/Desktop/Project/Frontend/lib/auth/get-current-user.ts):

```typescript
import { getCurrentUser } from '@/lib/auth/get-current-user';

export default async function Page() {
  const user = await getCurrentUser();
  // user.id is verified server-side from session
}
```

### Future Phase 5 Event Ownership Integration
When creating or editing events in Phase 5, API routes and Server Actions will use `getCurrentUser()` to retrieve `user.id` and bind it as `creatorId` on `Event` rows (`Event.creatorId = user.id`), ensuring robust multi-tenant authorization without trusting client-submitted payload user IDs.

---

## 7. Environment Variables Configuration

The following environment variables are required in `Frontend/.env`:

```env
# Database connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/photomarket?schema=public"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="development_secret_change_in_production_32bytes_min"
```

To generate a secure 32-character production secret:
```bash
openssl rand -base64 32
```

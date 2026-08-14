# Face Recognition Photo Marketplace

An AI-powered event photography marketplace designed as a university graduation project. The platform empowers event organizers and photographers to host private event photo albums, configure flexible pricing (`FREE` or `PAID`), automatically process event photography with AI face recognition (InsightFace `buffalo_l`), and allow event attendees to find all photos containing their face using a single temporary selfie.

---

## 🌟 Key Capabilities

### For Event Creators & Photographers
* **Event Management (CRUD)**: Create, edit, publish, or archive photo events with unique shareable public URLs (`/event/[slug]`).
* **Pricing Configuration**: Flexible `FREE` photo downloads or `PAID` pay-per-photo pricing (stored safely in minor currency units).
* **Multi-Photo Upload**: Drag & drop bulk photo uploads with automatic server-side image variant generation (Original, Preview, and Thumbnail derivatives).
* **AI Face Recognition Pipeline**: Automated face detection and 512-dimensional L2-normalized embedding extraction powered by InsightFace `buffalo_l` and ONNX Runtime CPU.
* **Creator Dashboard**: Unified dashboard tracking owned events, searchable photo metrics, and publishing status.

### For Event Attendees & Customers
* **Public Event Storefront (`/event/[slug]`)**: Access public event details, localized dates, pricing badges, and searchable photo counts without needing an account.
* **Search My Photos UI**: Upload a selfie or capture one using a mobile camera to search an event album for matching photos.
* **Strict Biometric Privacy**:
  - Face searches are strictly **Event-scoped** (never search across event boundaries).
  - Selfies and query embeddings are processed **strictly in memory** and are **never stored** on disk or in the database.
  - Original high-resolution photography remains strictly private until purchase/download.
* **Customer-Safe Photo Delivery**: Matched photos render safe preview derivatives via secure, authorized streaming endpoints.

---

## 🏗️ Architecture & Technology Stack

```
Project/
├── Backend/              # Python 3.14 FastAPI AI Engine (InsightFace, ONNX Runtime CPU, OpenCV)
├── Docker/               # Container configurations (Dockerfile.frontend, Dockerfile.backend)
├── docs/                 # System architecture, API specification & phase documentation
├── experiments/          # Research, model calibration & face recognition benchmarks
├── Frontend/             # Next.js 14 App Router, TypeScript, Auth.js, Tailwind CSS, Prisma ORM
├── docker-compose.yml    # Container orchestration (PostgreSQL 16, Backend, Frontend)
├── .env.example          # Root environment configuration template
└── README.md
```

### Tech Stack Details
* **Frontend**: Next.js 14 (App Router), TypeScript, React, Tailwind CSS, Auth.js (NextAuth) with bcrypt password hashing, Prisma ORM
* **Database**: PostgreSQL 16 (Alpine)
* **AI Backend**: Python 3.14, FastAPI, Pydantic v2, InsightFace (`buffalo_l` ArcFace ResNet50), ONNX Runtime CPU (`CPUExecutionProvider`), OpenCV (`opencv-python-headless`)
* **Infrastructure**: Docker & Docker Compose v2
* **Storage**: Abstraction provider (`StorageProvider`) writing to local named volume (`photo_storage`)

---

## 🚀 Quick Start with Docker (Recommended)

Docker Compose is the fastest way to launch the database, Python AI service, and Next.js web application.

### 1. Prerequisites
* **Git**
* **Docker Desktop** or **Docker Engine** with **Docker Compose v2**
* An active internet connection for first-time build and AI model initialization (~280 MB ONNX model pack download)

*(Note: Node.js and Python are NOT required on the host system when using Docker).*

---

### 2. Setup & Execution Steps

#### Step 1: Clone the Repository
```bash
git clone https://github.com/NPC39/Faceimage_Project.git
cd Faceimage_Project
```

#### Step 2: Configure Environment Files
Copy the environment template files:
```bash
cp .env.example .env
cp Frontend/.env.example Frontend/.env
cp Backend/.env.example Backend/.env
```

Generate a secure random secret for `NEXTAUTH_SECRET` in `.env` and `Frontend/.env`:
```bash
openssl rand -base64 32
```
*(Paste the generated 32-byte string into `NEXTAUTH_SECRET` in your `.env` files).*

#### Step 3: Launch Docker Stack
```bash
# Validate configuration
docker compose config

# Build images and launch services in background
docker compose up -d --build

# Verify container status
docker compose ps
```

> **First-Time Launch Notice**: On the first start, the Backend container automatically downloads the InsightFace `buffalo_l` model weights (~280 MB). Backend health check (`http://localhost:8000/health`) will report `"face_model": "ready"` once model loading completes (usually within 15–40 seconds depending on network speed).

#### Step 4: Deploy Database Schema Migrations
Run the initial Prisma migration on the PostgreSQL container:
```bash
docker compose exec frontend npx prisma migrate deploy
```

---

### 3. Service Access URLs

| Service | URL | Purpose |
| :--- | :--- | :--- |
| **Frontend Web App** | `http://localhost:3000` | Creator Dashboard, Public Event Storefront, & Face Search UI |
| **Backend AI API** | `http://localhost:8000/health` | FastAPI System & InsightFace Model Health Check |
| **Database GUI (Adminer)** | `http://localhost:8080` | PostgreSQL Browser GUI Management Interface |
| **PostgreSQL Database** | `localhost:5432` | Database Port (TCP Connection Only) |

### Database GUI — Adminer

Adminer is available at:

```text
http://localhost:8080
```

Login instructions:

* **System**: `PostgreSQL`
* **Server**: `postgres`
* **Username**: value from `POSTGRES_USER` (default: `postgres`)
* **Password**: value from `POSTGRES_PASSWORD` (default: `postgres`)
* **Database**: value from `POSTGRES_DB` (default: `photomarket`)

Note: `localhost:5432` is the PostgreSQL database connection port and is NOT a webpage that can be opened directly in a browser.

---

## 📸 Step-by-Step User Walkthrough

### Creator Journey (Event Hosting & AI Processing)

1. Open `http://localhost:3000` in your browser.
2. Click **Register** (`/register`) to create a creator account, then **Sign In** (`/login`).
3. Click **Create Event** (`/dashboard/events/new`) and enter details:
   - Event Name (e.g. `Graduation Ceremony 2026`)
   - Event Date
   - Pricing: Choose **FREE** or **PAID** (e.g. ฿49 per photo)
4. Click **Manage Photos** (`/dashboard/events/[id]/photos`) and drag & drop event photos.
5. Click **Process Photos with AI**. The backend extracts 512D face embeddings and bounding boxes.
6. Wait until photo processing status changes to **READY**.
7. Go to **Event Settings** (`/dashboard/events/[id]/settings`) and change status from `DRAFT` to `PUBLISHED`.
8. Copy the **Public Share Link** (e.g. `http://localhost:3000/event/graduation-ceremony-2026-a1b2c3`) or click **View Public Page**.

### Customer Journey (Face Search & Photo Match)

1. Open the public Event URL `http://localhost:3000/event/[slug]` (No login required).
2. In the **Find My Photos** section, click **Choose Photo** or **Take Selfie** (camera capture).
3. Preview your selected selfie locally (the preview is generated in browser memory via Object URL).
4. Click **Search My Photos**.
5. The system extracts a temporary 512D query embedding server-side, compares it against the event's candidate face embeddings via cosine similarity, and renders ranked matching photo previews.

---

## 🛠️ Useful Management & Maintenance Commands

### Viewing Logs
```bash
# Stream logs for all running services
docker compose logs -f

# Stream backend AI service logs only
docker compose logs -f backend

# Stream frontend logs only
docker compose logs -f frontend
```

### Rebuilding Services After Code Changes
```bash
# Rebuild Frontend container only
docker compose up -d --build frontend

# Rebuild Backend container only
docker compose up -d --build backend
```

### Stopping Services
```bash
# Stop containers cleanly (preserves database & uploaded photos)
docker compose down
```

> ⚠️ **DATA LOSS WARNING**: Do NOT run `docker compose down -v` unless you explicitly want to permanently delete your development database data and uploaded event photo volumes.

---

## 💻 Alternative Setup: Running Without Docker

If you prefer to run services natively on your host machine for active code debugging:

### Prerequisites
* **Node.js**: `v20.x` or later
* **Python**: `3.10` to `3.14`
* **PostgreSQL 16**: Running on `localhost:5432` with database `photomarket`

### 1. Backend Setup (`Backend/`)
```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run pytest backend test suite (36 tests)
pytest -v

# Start FastAPI development server
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup (`Frontend/`)
```bash
cd Frontend
npm install

# Run Prisma schema validation & client generation
npx prisma generate
npx prisma migrate deploy

# Run static checks & test suites
npm run lint
npx tsc --noEmit
npx tsx tests/public-event.test.ts

# Start Next.js development server
npm run dev
```

---

## ❓ Common Troubleshooting

### 1. Backend Model Startup Delay
* **Symptom**: `curl http://localhost:8000/health` returns `"face_model": "loading"`.
* **Fix**: Allow 15–30 seconds for FastAPI startup to initialize ONNX Runtime and InsightFace `buffalo_l` weights. Verify status with `docker compose logs -f backend`.

### 2. Database Connection Refused
* **Symptom**: `PrismaClientInitializationError: Cannot reach database server`.
* **Fix**: Ensure PostgreSQL container is running and healthy (`docker compose ps`). Run `docker compose exec frontend npx prisma migrate deploy` to ensure schema tables exist.

### 3. Face Search Returns No Matches
* **Checklist**:
  1. Is the Event status set to **PUBLISHED**? (Draft events return 404).
  2. Are the Event photos in **READY** processing status?
  3. Is the selfie clear, well-lit, and front-facing?
  4. Does the selfie photo feature a person who appears in the event album?

### 4. Port Conflict (3000 / 8000 / 5432)
* **Fix**: If port 3000, 8000, or 5432 is already bound by another local process, stop the conflicting service or update `PORT` configuration in `.env`.

---

## 📌 Phased Implementation Roadmap

- [x] **Phase 1**: Project Setup, Clean Decoupled Architecture, & Docker Compose
- [x] **Phase 2**: PostgreSQL Database Schema & Prisma ORM Models
- [x] **Phase 3**: User Authentication (Auth.js / NextAuth & bcrypt)
- [x] **Phase 4**: Creator Dashboard UI & Event Analytics Metric Counters
- [x] **Phase 5**: Event Management CRUD & Unique Slug Generation
- [x] **Phase 6**: Private Photo Upload System & Variant Generation (Original / Preview / Thumbnail)
- [x] **Phase 7**: FastAPI Face Recognition Service (InsightFace `buffalo_l` 512D Embeddings & Cosine Similarity)
- [x] **Phase 8**: Event Photo Face Processing Pipeline & Atomic Biometric Indexing
- [x] **Phase 9**: Event-Scoped Face Search API & Privacy Boundary Controls
- [x] **Phase 10**: Customer Public Event Storefront (`/event/[slug]`)
- [x] **Phase 11**: Search My Photos UI & Customer-Safe Photo Preview Delivery
- [ ] **Phase 12**: Customer Cart System
- [ ] **Phase 13**: Order Creation & Order Lifecycle Management
- [ ] **Phase 14**: Mock Payment Integration (PromptPay / Stripe Mock)
- [ ] **Phase 15**: Secure High-Resolution Original Download Delivery
- [ ] **Phase 16**: Creator Sales Analytics & Order History
- [ ] **Phase 17**: Biometric Privacy Hardening & Rate Limiting
- [ ] **Phase 18**: System Polish, Documentation & Final Graduation Presentation

---

## 📄 License & Project Scope

Designed and developed as a university graduation project. All uploaded photographs, biometric embeddings, and search operations are handled with strict privacy controls.

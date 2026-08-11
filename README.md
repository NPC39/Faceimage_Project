# Face Recognition Photo Marketplace

An AI-powered photo event marketplace designed as a university graduation project. The platform allows event creators and photographers to upload event photo albums, generate custom event links, and automatically match attendees with their photos using AI face recognition.

---

## 🌟 Key Features Overview

- **Photo Event Creation**: Organizers create events, set pricing per photograph, and upload batch event albums.
- **AI Face Recognition**: Attendees upload a single selfie to instantly locate every photograph containing their face across massive event albums.
- **Pay-Per-Photo Monetization**: Watermarked preview grid with micro-transaction checkout to unlock high-resolution originals.
- **Decoupled Architecture**: High-performance Next.js Frontend paired with a Python FastAPI AI engine.

---

## 🏗️ Architecture

```
Project/
├── Frontend/             # Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
├── Backend/              # Python FastAPI, Pydantic v2, Uvicorn (InsightFace/OpenCV in Phase 2+)
├── Docker/               # Multi-stage Dockerfiles (Dockerfile.frontend, Dockerfile.backend)
├── docs/                 # System design & API specification documents
├── experiments/          # Research, model calibration & face recognition benchmark workspace
├── docker-compose.yml    # Development stack (PostgreSQL 16, Backend, Frontend)
├── .env.example          # Environment configuration template
└── README.md
```

---

## 📋 System Requirements

- **Node.js**: `v20.x` or later
- **npm**: `v10.x` or later
- **Python**: `3.10` to `3.14`
- **Docker & Docker Compose** (Optional for containerized development)

---

## 🚀 Quick Start & Development Commands

### 1. Environment Setup

Copy `.env.example` to `.env` in the root, Frontend, and Backend directories:

```bash
cp .env.example .env
cp Frontend/.env.example Frontend/.env
cp Backend/.env.example Backend/.env
```

---

### 2. Frontend Development (`Frontend/`)

```bash
# Navigate to Frontend
cd Frontend

# Install dependencies
npm install

# Run ESLint check
npm run lint

# Run TypeScript type check
npx tsc --noEmit

# Build production bundle
npm run build

# Start local development server (http://localhost:3000)
npm run dev
```

---

### 3. Backend Development (`Backend/`)

```bash
# Navigate to Backend
cd Backend

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install requirements
pip install -r requirements.txt

# Run automated tests
pytest

# Start FastAPI development server (http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```

---

### 4. Docker Stack Execution

To launch PostgreSQL database, FastAPI Backend, and Next.js Frontend using Docker Compose:

```bash
# Start all services in background
docker compose up -d

# View container logs
docker compose logs -f

# Stop container stack
docker compose down
```

---

## 🧪 Verification & Health Checks

- **Frontend Landing Page**: Visit `http://localhost:3000`
- **Frontend Dashboard Placeholder**: Visit `http://localhost:3000/dashboard`
- **Backend Health Check Endpoint**:
  ```bash
  curl http://localhost:8000/health
  ```
  Expected Response:
  ```json
  {
    "status": "ok",
    "service": "photo-marketplace-backend",
    "version": "0.1.0",
    "timestamp": "2026-08-11T20:30:00.000000+00:00"
  }
  ```

---

## 📌 Phase Roadmap

- [x] **Phase 1**: Project Setup, Clean Architecture, Next.js Landing & Dashboard, FastAPI Health Check, Docker Compose.
- [ ] **Phase 2**: Database Schema (Prisma / PostgreSQL) & User Authentication (Auth.js).
- [ ] **Phase 3**: InsightFace & OpenCV Face Recognition Engine & Event Photo Upload Pipeline.
- [ ] **Phase 4**: Watermarked Photo Grid, Pay-Per-Photo Checkout & Final Graduation Presentation Polish.

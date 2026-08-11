# System Architecture Overview

## High-Level Architecture

The Face Recognition Photo Marketplace is designed with a decoupled architecture separating the user interface, core APIs, and AI heavy lifting.

```
[ Customer / Creator ]
        │
        ▼
[ Next.js Frontend ]  ──(HTTP/JSON)──>  [ FastAPI Backend ]
                                              │
                                              ├─> [ PostgreSQL Database ]
                                              └─> [ Face Recognition Engine (Phase 2+) ]
```

## Core Components

### 1. Frontend (`Frontend/`)
- Built with **Next.js App Router**, **TypeScript**, and **Tailwind CSS**.
- Handles public event discovery, selfie capture/upload, watermarked photo grid preview, checkout flow, and event creator dashboards.

### 2. Backend (`Backend/`)
- Built with **Python** & **FastAPI**.
- Exposes high-performance REST APIs for health check, metadata management, and future AI inference.

### 3. Database (`Docker/docker-compose.yml`)
- **PostgreSQL 16** for relational metadata storage (Users, Events, Photos, Matches, Transactions).

### 4. AI Engine (`experiments/` & future backend module)
- Dedicated pipeline using **InsightFace** and **OpenCV** for facial detection, embedding extraction, and cosine similarity matching.

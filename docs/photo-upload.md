# Photo Upload & Storage Architecture

This document describes the Phase 6 Event Photo Upload & Private Storage System for the **Face Recognition Photo Marketplace** project.

---

## 1. Overview & Goal

Phase 6 provides a secure, reliable foundation for uploading, validating, processing, serving, and deleting event photos. It separates **storage & variant management** from future **AI Face Recognition processing (Phase 7 & 8)**.

Key capabilities:
- **Private Storage**: Original photos and generated variants are stored in a private directory (`storage/` outside `Frontend/public/`), inaccessible to unauthenticated web requests.
- **Server-Side Image Decoding & Validation**: Images are parsed and decoded on the server using `sharp` to verify payload integrity and reject non-image or corrupted files.
- **Variant Generation**: Automatically creates optimized WebP preview images (max 1600px) and grid thumbnails (max 400px).
- **Storage Abstraction**: Loose coupling via `StorageProvider` interface (`LocalStorageProvider` default).
- **Security & Authorization**: Strict server-side event ownership verification (`event.creatorId === currentUser.id`) on upload, listing, serving, and deletion.
- **Multi-File UX**: Drag & Drop upload with batch queue concurrency (max 3 active), real-time progress per file via `XMLHttpRequest`, failure retry, and photo grid management.

---

## 2. Status Semantics (`PhotoProcessingStatus`)

Prisma schema status enum values:
- `UPLOADING`: Transient client/upload state.
- `UPLOADED`: File stored privately and variants generated; ready for future Phase 8 AI face processing.
- `PROCESSING`: Phase 8 AI worker execution in progress.
- `READY`: Phase 8 AI face detection complete.
- `FAILED`: Image decoding, variant generation, or upload failure.

> [!NOTE]
> Successfully saved photos are assigned `processingStatus: PhotoProcessingStatus.UPLOADED`. Photos transition to `PROCESSING` and then `READY` (or `FAILED`) via the Phase 8 face processing pipeline. See [docs/photo-processing.md](file:///Users/nppn/Desktop/Project/docs/photo-processing.md).


---

## 3. Storage Abstraction (`StorageProvider`)

Located in [`Frontend/lib/storage/`](file:///Users/nppn/Desktop/Project/Frontend/lib/storage/):
- Interface: `StorageProvider`
- Implementation: `LocalStorageProvider`
- Factory: `getStorageProvider()`

### Key Structure Layout
```
storage/
└── events/
    └── {eventId}/
        └── {photoId}/
            ├── original.jpg (or .png / .webp)
            ├── preview.webp  (max 1800px WebP, quality 88)
            └── thumbnail.webp (max 600px WebP, quality 85)
```

### Security & Path Traversal Prevention
`LocalStorageProvider.resolveKey` verifies that resolved file paths remain strictly inside the storage root directory:
```ts
const absolutePath = path.resolve(this.rootDir, key);
const relative = path.relative(this.rootDir, absolutePath);
if (relative.startsWith('..') || path.isAbsolute(relative) || !absolutePath.startsWith(this.rootDir)) {
  throw new Error(`Security Violation: Key "${key}" attempts path traversal outside storage root.`);
}
```

---

## 4. API Endpoints

| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/events/[id]/photos` | Event Owner | Upload multi-part image(s). Decodes, saves original & variants, creates `EventPhoto`. |
| `GET` | `/api/events/[id]/photos` | Event Owner | List all `EventPhoto` records for the event. |
| `DELETE` | `/api/events/[id]/photos/[photoId]` | Event Owner | Delete `EventPhoto` DB record and storage files. |
| `GET` | `/api/events/[id]/photos/[photoId]/[variant]` | Event Owner | Securely serve private image variant (`thumbnail`, `preview`, `original`). |

---

## 5. Docker Volume & Persistence

In [`docker-compose.yml`](file:///Users/nppn/Desktop/Project/docker-compose.yml):
```yaml
frontend:
  environment:
    - STORAGE_PROVIDER=local
    - LOCAL_STORAGE_ROOT=/app/storage
    - MAX_PHOTO_UPLOAD_MB=20
  volumes:
    - photo_storage:/app/storage

volumes:
  photo_storage:
```
Uploaded local photos persist in the named Docker volume `photo_storage` across container restarts.

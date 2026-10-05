# P4 — Receipt Capture, Private Storage & Offline Drafts

P4 establishes the capture layer that feeds the P5 OCR/extraction pipeline.

## User flow

1. Open **Scan**
2. Capture a page with the camera or choose an existing image/PDF
3. Add more pages if the receipt is long or split across images
4. Reorder/remove pages
5. Finalize
6. P5 processing can begin from the immutable ordered page set

A receipt total is intentionally unknown during capture. `total_minor` is nullable until extraction/review determines it.

## Private storage

Bucket: `finance-receipts`

The bucket is private and restricted to 20 MiB per object.

Allowed content types:

- JPEG
- PNG
- WebP
- HEIC / HEIF
- PDF

Object path:

```text
<user-id>/<receipt-id>/<client-page-id>.<extension>
```

Storage RLS requires both:

- the first folder belongs to the authenticated user; and
- the receipt ID in the second folder exists and belongs to that user.

Downloads therefore require an authenticated Storage request or a short-lived signed URL.

## Multi-page model

`finance.receipt_pages` stores ordered page metadata independently of the receipt.

Each page has:

- stable client page ID for retry idempotency
- page index
- Storage path
- MIME type
- byte size
- image dimensions
- SHA-256
- capture time and method
- processing state

Page order is explicitly editable until the capture is finalized.

## Offline-first capture

The browser stores capture drafts and their Blob objects in IndexedDB.

A capture can therefore be created while offline:

```text
local draft
  ↓
one or more local pages
  ↓
network available
  ↓
start idempotent server session
  ↓
upload deterministic page paths
  ↓
register metadata
  ↓
reorder
  ↓
finalize
```

The same `clientCaptureId` and `clientPageId` values are reused on retries.

## Image preparation

For JPEG/PNG/WebP inputs the browser:

- decodes the image;
- preserves aspect ratio;
- caps the long edge at 3200 px;
- outputs high-quality JPEG;
- computes SHA-256;
- records dimensions.

HEIC/HEIF and PDF are retained unchanged because browser decoding support varies. A later processing layer can normalize them server-side.

## Camera

The browser camera helper requests the rear/environment camera when available and captures the current full-resolution video frame to JPEG.

No OCR or automatic edge detection is performed in P4. Those belong to the processing pipeline, not the capture truth layer.

## State separation

Capture state:

- draft
- uploading
- ready
- cancelled

Processing state remains separate:

- captured
- preprocessing
- extracting
- normalizing
- classifying
- review_required
- confirmed
- processing_failed
- incomplete

This prevents upload failures from being confused with OCR failures.

## P5 handoff

P5 receives a finalized receipt ID and an ordered, private set of pages. It does not need to know how the pages were captured or whether they were initially offline.

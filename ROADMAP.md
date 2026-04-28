# TrailTales — Roadmap (Phases 5–10)

Phases 1–5 are complete. This document tracks remaining work.

---

## Phase 5: Functional Improvements & Bug Fixes ✅

**Focus:** Stabilization, UX fixes, and feature completion from Phases 1–4.

### 5.1 Memory Writing Sync Fix ✅
- Removed inconsistent debounced auto-save while typing.
- Implemented controlled save mechanism:
  - Explicit **Save** button in the lightbox.
  - Save automatically when the lightbox is closed (Escape, ×, or backdrop click) if the note is dirty.
  - `beforeunload` warning if the user closes the tab with unsaved changes.
- No loss or duplication of typed content.

### 5.2 Upload Error Transparency ✅
- Replaced generic "Upload Failed" with categorized feedback via a typed `UploadError` (`unsupported-format`, `too-large`, `quota-exceeded`, `network`, `server`).
- Specific messages now distinguish:
  - Unsupported file format (with the offending MIME type).
  - File size vs. per-type cap.
  - Network / S3 transport failures (timeout, abort, HTTP status).
  - Server-side quota / validation errors.
- Failed rows in the upload queue stay visible longer so users can read them.

### 5.3 Media Storage Optimization (AWS) ✅
- Photos no longer get a separate thumbnail in S3 — the original is reused with browser-side `object-fit: cover` for grid previews. This halves the object count and write cost for image uploads.
- Videos still get a generated thumbnail (used as a poster frame).
- Backend `build_keys` returns `thumbnailKey=None` for photos; `presign_upload` skips the thumb URL; `confirm_upload` skips thumb size checks when absent.

### 5.4 Expense Editing ✅
- Added `useUpdateExpense` hook bound to the existing `PATCH /trips/:id/expenses/:id` endpoint.
- ExpensePanel form is now reusable for create *and* edit.
- Each row has an edit (✎) button; the active row is highlighted while editing.
- UI updates in real time via React Query invalidation.

### 5.5 Currency Handling ✅
- One currency per trip (no real-time forex).
- Trips now have a `defaultCurrency` field (default `USD`); legacy trips fall back to `USD` on read.
- AddTripModal includes a currency selector at creation.
- Trip dashboard exposes a currency selector; locked once any expenses exist (server returns 409 if changed).
- Expense create/update endpoints ignore client currency and use the trip's currency, so summaries can never mix units.
- Expense form no longer asks for a currency — the amount label shows the trip currency.

---

## Phase 6: GitHub Setup & Collaboration ✅

**Focus:** Codebase management and version control.

### 6.1 Repository Setup
- Push project from local to personal GitHub account.
- Resolve conflicts with corporate Git config:
  - Use SSH authentication if needed.
  - Ensure correct user/email account mapping.

### 6.2 Collaboration Setup
- Add collaborator(s) to the repository.
- Verify proper access permissions and a smooth push/pull workflow.

---

## Phase 7: Collaborator Contributions (Magic-Link Uploads) ✅

**Focus:** Social and collaborative features.

- Owner generates per-email invite links from the trip dashboard. Tokens are
  one-shot (32-byte url-safe), stored only as `sha256` hashes in the new
  `collabInvites` collection, and shown to the owner exactly once at creation.
- Invites expire after 30 days; owners can also revoke them. Expiry is
  enforced server-side and the status is auto-flipped to `expired` on access.
- Public `/contribute/:token` page (no auth) shows the trip context, requires
  the guest to enter their name, and lets them upload photos/videos via the
  same presign/confirm flow as the owner.
- Guest uploads land with `status="pending-review"` and `source="collaborator"`,
  store `guestName` / `guestEmail` / `inviteId`, and count against the trip
  owner's storage quota.
- Pending submissions are hidden from the gallery and shown in a new
  **Pending contributions** panel on the dashboard with accept / decline
  actions. Decline frees the S3 object immediately.
- The trip GET response includes a `pendingCount` so the dashboard can show
  an in-app badge when new submissions arrive (in-app only — no email infra).

---

## Phase 8: Reel Generator (Auto Storytelling) ✅

**Focus:** Short highlight reels rendered server-side from trip media.

- v1 supports a **manual** selection of up to 30 photos and/or videos per reel.
- Two styles: **classic** (3 s per photo, 5 s max per video, 0.5 s crossfade
  transitions) and **punchy** (1.5 s / 2.5 s, hard cuts).
- Bundled royalty-free music tracks live in
  `server/app/assets/music/`. Track id = filename (no extension); the picker
  scans the directory at request time. "No music" produces a silent reel.
- Output: 1280×720 / 30 fps / H.264 + AAC mp4, faststart-muxed for in-browser
  playback. A 1.5 s audio fade-out is applied at the tail when music is used.
- **Renderer**: a single `ffmpeg` invocation per reel. Each input is normalized
  via `scale=...:force_original_aspect_ratio=decrease,pad=...,setsar=1,fps=30,format=yuv420p`,
  then either `concat`ed (punchy) or chained through `xfade` (classic). Photos
  use `-loop 1 -t <dur>`; videos are trimmed with `-t <max>`.
- **Job system**: in-process `threading.Thread` spawned from the create
  endpoint. State machine `queued → rendering → ready | failed`. The frontend
  polls every 3 s while any reel is in flight (React Query `refetchInterval`).
- **Storage**: rendered mp4s upload back to S3 under
  `users/<owner>/trips/<trip>/reels/<reelId>.mp4`; `GET /api/trips/:id/reels`
  returns presigned download URLs.
- **Endpoints**: `GET/POST /api/trips/:id/reels`, `GET/DELETE /api/reels/:id`,
  `GET /api/reels/music`. FFmpeg presence is checked up front so missing
  binaries return a clear 500 rather than a slow async failure.
- **UI**: a **Reels** section on the trip dashboard listing every reel with
  status badge, in-page video player (when ready), and a "+ New reel" modal
  for ordered media selection, style choice, and music dropdown.

---

## Phase 9: AI Itinerary Planner

**Focus:** Smart feature addition.

- AI-powered itinerary planner suggesting trip plans based on user inputs.
- Enhances trip organization experience.
- Keep v1 scope practical — avoid over-engineering.

---

## Phase 10: Public Moodboard

## Phase 11: Print Hand Book

## Phase 12: UI revamp

## Phase 13: Final debugging + Deployment
**Focus:** Production readiness.

- End-to-end testing (UI + backend).
- Fix edge cases and performance issues.
- Optimize load times and media handling.
- Deploy application to production environment.

## Phase 14: Prisma + Sonar Qube + Git Actions

## Phase 15: Redis 
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

## Phase 6: GitHub Setup & Collaboration

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

## Phase 7: UI Revamp

**Focus:** Visual redesign and improved user experience.

- Redesign UI using **Lovable** (handled externally).
- No backend or business-logic changes in this phase.
- Proceed to Phase 8 once the UI is finalized.

---

## Phase 8: Collaborator Contributions (Magic-Link Uploads)

**Focus:** Social and collaborative features.

- Invited collaborators upload photos/videos via **magic link** (no account).
- Owner receives notifications for new submissions.
- Owner can **accept** or **decline** each contribution (moderation control).
- Maintain seamless UX across invite → upload → review.

---

## Phase 9: AI Itinerary Planner

**Focus:** Smart feature addition.

- AI-powered itinerary planner suggesting trip plans based on user inputs.
- Enhances trip organization experience.
- Keep v1 scope practical — avoid over-engineering.

---

## Phase 10: Final Polish & Deployment

**Focus:** Production readiness.

- End-to-end testing (UI + backend).
- Fix edge cases and performance issues.
- Optimize load times and media handling.
- Deploy application to production environment.

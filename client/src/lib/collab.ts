/**
 * Phase 7: Collaborator invitations and guest contributions.
 *
 * - Owner-side hooks (require auth) manage invites and moderate pending media.
 * - `fetchInvite` / `uploadAsGuest` are used by the public ContributePage
 *   and rely on the fact that `api` only attaches a JWT header when one is
 *   present in the auth store (guests have none).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Media } from "./media";
import type { TripLocation } from "./trips";
import { UploadError, UploadProgress } from "./upload";

export type Invite = {
  id: string;
  tripId: string;
  ownerId: string;
  email: string;
  status: "active" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  lastUsedAt: string | null;
  uploadCount: number;
};

export type CreatedInvite = {
  invite: Invite & { inviteUrl: string };
  token: string;
  inviteUrl: string;
  emailSent: boolean;
  emailConfigured: boolean;
};

export type PendingMedia = Media & {
  guestName?: string;
  guestEmail?: string;
};

export type InvitePublicInfo = {
  trip: {
    id: string;
    title: string;
    location: TripLocation;
    startDate: string | null;
    endDate: string | null;
  };
  ownerName: string;
  guestEmail: string;
  expiresAt: string;
};

// ---------------------------------------------------------------------------
// Owner: invites
// ---------------------------------------------------------------------------

export function useInvites(tripId: string | undefined) {
  return useQuery({
    queryKey: ["invites", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<{ invites: Invite[] }>(`/trips/${tripId}/invites`);
      return res.data.invites;
    },
  });
}

export function useCreateInvite(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const res = await api.post<CreatedInvite>(`/trips/${tripId}/invites`, { email });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites", tripId] });
    },
  });
}

export function useRevokeInvite(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      await api.delete(`/trips/${tripId}/invites/${inviteId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites", tripId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Owner: moderation of pending submissions
// ---------------------------------------------------------------------------

export function usePendingMedia(tripId: string | undefined) {
  return useQuery({
    queryKey: ["pending-media", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<{ media: PendingMedia[] }>(
        `/trips/${tripId}/media/pending`,
      );
      return res.data.media;
    },
    staleTime: 30 * 60 * 1000,
  });
}

function invalidateAfterModeration(qc: ReturnType<typeof useQueryClient>, tripId?: string) {
  qc.invalidateQueries({ queryKey: ["pending-media", tripId] });
  qc.invalidateQueries({ queryKey: ["media", tripId] });
  qc.invalidateQueries({ queryKey: ["trip", tripId] });
}

export function useAcceptMedia(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mediaId: string) => {
      const res = await api.post<{ media: Media }>(`/media/${mediaId}/accept`);
      return res.data.media;
    },
    onSuccess: () => invalidateAfterModeration(qc, tripId),
  });
}

export function useDeclineMedia(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mediaId: string) => {
      await api.post(`/media/${mediaId}/decline`);
    },
    onSuccess: () => invalidateAfterModeration(qc, tripId),
  });
}

// ---------------------------------------------------------------------------
// Public guest endpoints (no auth)
// ---------------------------------------------------------------------------

export async function fetchInvite(token: string): Promise<InvitePublicInfo> {
  const res = await api.get<InvitePublicInfo>(`/collab/invites/${token}`);
  return res.data;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const THUMB_MAX_DIM = 400;

const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export async function uploadAsGuest(
  token: string,
  guestName: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<void> {
  validateBeforeUpload(file);
  const contentType = file.type;
  const isVideo = contentType.startsWith("video/");

  onProgress?.({ stage: "thumbnail", percent: 5 });
  const thumbBlob = isVideo ? await generateVideoThumbnail(file) : null;

  onProgress?.({ stage: "presign", percent: 15 });
  let presignRes;
  try {
    presignRes = await api.post<{
      mediaId: string;
      uploadUrl: string;
      thumbUploadUrl: string | null;
    }>(`/collab/invites/${token}/media/presign`, {
      guestName,
      contentType,
      sizeBytes: file.size,
    });
  } catch (err) {
    throw mapServerError(err);
  }
  const { mediaId, uploadUrl, thumbUploadUrl } = presignRes.data;

  onProgress?.({ stage: "uploading", percent: 25 });
  await putToS3(uploadUrl, file, contentType, (pct) =>
    onProgress?.({ stage: "uploading", percent: 25 + pct * 0.6 }),
  );

  if (thumbBlob && thumbUploadUrl) {
    await putToS3(thumbUploadUrl, thumbBlob, "image/jpeg");
  }

  onProgress?.({ stage: "confirming", percent: 90 });
  try {
    await api.post(`/collab/invites/${token}/media/confirm`, { mediaId });
  } catch (err) {
    throw mapServerError(err);
  }
  onProgress?.({ stage: "done", percent: 100 });
}

function validateBeforeUpload(file: File) {
  const type = file.type;
  const isPhoto = type.startsWith("image/");
  const isVideo = type.startsWith("video/");
  if (!isPhoto && !isVideo) {
    throw new UploadError(
      "unsupported-format",
      `Unsupported file format${type ? `: ${type}` : ""}.`,
    );
  }
  if (isPhoto && !ALLOWED_PHOTO_TYPES.has(type)) {
    throw new UploadError("unsupported-format", `Image format not supported (${type}).`);
  }
  if (isVideo && !ALLOWED_VIDEO_TYPES.has(type)) {
    throw new UploadError("unsupported-format", `Video format not supported (${type}).`);
  }
  const cap = isPhoto ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (file.size > cap) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const capMb = cap / (1024 * 1024);
    throw new UploadError(
      "too-large",
      `File is ${sizeMb} MB — exceeds the ${capMb} MB limit for ${isPhoto ? "photos" : "videos"}.`,
    );
  }
}

function mapServerError(err: unknown): UploadError {
  // Avoid importing apiErrorMessage to keep this file self-contained.
  const anyErr = err as { response?: { data?: { error?: string } }; message?: string };
  const msg = anyErr?.response?.data?.error ?? anyErr?.message ?? "Upload failed";
  const lower = msg.toLowerCase();
  if (lower.includes("quota")) return new UploadError("quota-exceeded", msg);
  if (lower.includes("exceed") || lower.includes("too large") || lower.includes("cap")) {
    return new UploadError("too-large", msg);
  }
  if (lower.includes("unsupported") || lower.includes("contenttype")) {
    return new UploadError("unsupported-format", msg);
  }
  if (lower.includes("invalid") || lower.includes("expired") || lower.includes("revoked")) {
    return new UploadError("server", msg);
  }
  return new UploadError("server", msg);
}

function putToS3(
  url: string,
  body: Blob,
  contentType: string,
  onPercent?: (p: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onPercent) onPercent((e.loaded / e.total) * 100);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new UploadError(
            "network",
            `Upload to storage failed (${xhr.status}${xhr.statusText ? ` ${xhr.statusText}` : ""}).`,
          ),
        );
    };
    xhr.onerror = () =>
      reject(new UploadError("network", "Network error while uploading to storage."));
    xhr.ontimeout = () =>
      reject(new UploadError("network", "Upload timed out."));
    xhr.onabort = () => reject(new UploadError("network", "Upload was aborted."));
    xhr.send(body);
  });
}

async function generateVideoThumbnail(file: File): Promise<Blob | null> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("Video load failed"));
      });
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = Math.min(0.2, (video.duration || 1) / 4);
      });
      const w = video.videoWidth;
      const h = video.videoHeight;
      const scale = Math.min(1, THUMB_MAX_DIM / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8),
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.warn("video thumbnail generation failed", e);
    return null;
  }
}

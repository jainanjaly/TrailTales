import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type Media = {
  id: string;
  tripId: string;
  ownerId: string;
  uploaderId: string;
  type: "photo" | "video";
  s3Key: string;
  thumbnailKey: string | null;
  note: string;
  takenAt: string | null;
  source: "owner" | "collaborator";
  status: "pending-upload" | "accepted" | "pending-review" | "declined";
  sizeBytes: number;
  contentType: string;
  createdAt: string;
  url?: string;
  thumbnailUrl?: string;
};

export function useMediaList(tripId: string | undefined) {
  return useQuery({
    queryKey: ["media", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<{ media: Media[] }>(`/trips/${tripId}/media`);
      return res.data.media;
    },
    // Presigned GET URLs expire in 1 hour; refetch periodically to avoid staleness.
    staleTime: 30 * 60 * 1000,
  });
}

export function useUpdateMediaNote(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mediaId, note }: { mediaId: string; note: string }) => {
      const res = await api.patch<{ media: Media }>(`/media/${mediaId}`, { note });
      return res.data.media;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media", tripId] });
    },
  });
}

export function useDeleteMedia(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mediaId: string) => {
      await api.delete(`/media/${mediaId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media", tripId] });
    },
  });
}

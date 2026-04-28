import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type ReelStyle = "classic" | "punchy";
export type ReelStatus = "queued" | "rendering" | "ready" | "failed";

export type Reel = {
  id: string;
  tripId: string;
  ownerId: string;
  title: string;
  style: ReelStyle;
  musicTrackId: string | null;
  mediaIds: string[];
  status: ReelStatus;
  errorMessage: string | null;
  s3Key: string | null;
  sizeBytes: number;
  durationSec: number | null;
  createdAt: string;
  completedAt: string | null;
  downloadUrl?: string;
};

export type MusicTrack = { id: string; name: string; ext: string };

export type CreateReelInput = {
  title?: string;
  style: ReelStyle;
  musicTrackId: string | null;
  mediaIds: string[];
};

export function useReels(tripId: string | undefined) {
  return useQuery({
    queryKey: ["reels", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<{ reels: Reel[] }>(`/trips/${tripId}/reels`);
      return res.data.reels;
    },
    // While any reel is queued/rendering, refetch every 3s for status updates.
    refetchInterval: (query) => {
      const reels = query.state.data ?? [];
      return reels.some((r) => r.status === "queued" || r.status === "rendering")
        ? 3000
        : false;
    },
  });
}

export function useCreateReel(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReelInput) => {
      const res = await api.post<{ reel: Reel }>(`/trips/${tripId}/reels`, input);
      return res.data.reel;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reels", tripId] });
    },
  });
}

export function useDeleteReel(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reelId: string) => {
      await api.delete(`/reels/${reelId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reels", tripId] });
    },
  });
}

export function useMusicTracks() {
  return useQuery({
    queryKey: ["music-tracks"],
    queryFn: async () => {
      const res = await api.get<{ tracks: MusicTrack[] }>("/reels/music");
      return res.data.tracks;
    },
    staleTime: 60 * 60 * 1000,
  });
}

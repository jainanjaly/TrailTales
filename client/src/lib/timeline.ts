import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type TimelineEntry = {
  id: string;
  tripId: string;
  date: string;
  title: string;
  description: string;
  createdAt: string;
};

export type TimelineEntryInput = {
  date: string;
  title: string;
  description?: string;
};

export function useTimeline(tripId: string | undefined) {
  return useQuery({
    queryKey: ["timeline", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<{ entries: TimelineEntry[] }>(`/trips/${tripId}/timeline`);
      return res.data.entries;
    },
  });
}

export function useCreateTimelineEntry(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TimelineEntryInput) => {
      const res = await api.post<{ entry: TimelineEntry }>(`/trips/${tripId}/timeline`, input);
      return res.data.entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline", tripId] });
    },
  });
}

export function useDeleteTimelineEntry(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      await api.delete(`/trips/${tripId}/timeline/${entryId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timeline", tripId] });
    },
  });
}

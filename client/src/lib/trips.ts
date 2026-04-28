import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type TripLocation = {
  name: string;
  lat: number;
  lng: number;
  country?: string | null;
};

export type Trip = {
  id: string;
  ownerId: string;
  title: string;
  location: TripLocation;
  startDate: string | null;
  endDate: string | null;
  defaultCurrency: string;
  coverMediaId: string | null;
  createdAt: string;
  pendingCount?: number;
};

export type TripInput = {
  title: string;
  location: TripLocation;
  startDate?: string | null;
  endDate?: string | null;
  defaultCurrency?: string;
};

export type TripUpdate = Partial<TripInput>;

export function useTrips() {
  return useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const res = await api.get<{ trips: Trip[] }>("/trips");
      return res.data.trips;
    },
  });
}

export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ["trip", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<{ trip: Trip }>(`/trips/${tripId}`);
      return res.data.trip;
    },
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TripInput) => {
      const res = await api.post<{ trip: Trip }>("/trips", input);
      return res.data.trip;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tripId: string) => {
      await api.delete(`/trips/${tripId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export function useUpdateTrip(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: TripUpdate) => {
      const res = await api.patch<{ trip: Trip }>(`/trips/${tripId}`, updates);
      return res.data.trip;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

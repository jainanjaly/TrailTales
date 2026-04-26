/**
 * Nominatim (OpenStreetMap) geocoding client.
 *
 * Terms of use: https://operations.osmfoundation.org/policies/nominatim/
 * - Max 1 request/second
 * - Include a descriptive User-Agent or Referer (browser sets Referer automatically)
 * - No heavy use; fine for small personal apps
 */

export type GeocodeResult = {
  displayName: string;
  name: string;
  lat: number;
  lng: number;
  country?: string | null;
};

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

let lastCallAt = 0;
const MIN_INTERVAL_MS = 1100;

async function throttle() {
  const now = Date.now();
  const wait = lastCallAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export async function searchPlaces(query: string, limit = 5): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  await throttle();
  const url = `${ENDPOINT}?format=jsonv2&addressdetails=1&limit=${limit}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const raw = (await res.json()) as Array<{
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
    address?: { country?: string };
  }>;
  return raw.map((r) => ({
    displayName: r.display_name,
    name: r.name || r.display_name.split(",")[0],
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    country: r.address?.country ?? null,
  }));
}

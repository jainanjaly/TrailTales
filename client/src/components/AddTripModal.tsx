import { FormEvent, useEffect, useState } from "react";
import { apiErrorMessage } from "../lib/api";
import { GeocodeResult, searchPlaces } from "../lib/geocode";
import { TripInput, useCreateTrip } from "../lib/trips";

type Props = {
  onClose: () => void;
  onCreated?: (tripId: string) => void;
};

export default function AddTripModal({ onClose, onCreated }: Props) {
  const createTrip = useCreateTrip();

  const [title, setTitle] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [selected, setSelected] = useState<GeocodeResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [error, setError] = useState<string | null>(null);

  // Debounced geocoding
  useEffect(() => {
    if (selected && locationQuery === selected.displayName) return;
    const q = locationQuery.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchPlaces(q);
        if (!cancelled) setResults(r);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [locationQuery, selected]);

  function pick(r: GeocodeResult) {
    setSelected(r);
    setLocationQuery(r.displayName);
    setResults([]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Pick a location from the dropdown");
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const input: TripInput = {
      title: title.trim(),
      location: {
        name: selected.name,
        lat: selected.lat,
        lng: selected.lng,
        country: selected.country ?? null,
      },
      startDate: startDate || null,
      endDate: endDate || null,
      defaultCurrency: defaultCurrency.toUpperCase(),
    };
    try {
      const trip = await createTrip.mutateAsync(input);
      onCreated?.(trip.id);
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create trip"));
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Add a trip</h2>
          <button onClick={onClose} style={closeBtn} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label>
            Title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Iceland road trip"
              style={input}
              required
            />
          </label>

          <label style={{ position: "relative" }}>
            Location
            <input
              value={locationQuery}
              onChange={(e) => {
                setSelected(null);
                setLocationQuery(e.target.value);
              }}
              placeholder="Search city, country, or landmark"
              style={input}
              required
            />
            {searching && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Searching…</div>
            )}
            {results.length > 0 && (
              <ul style={dropdown}>
                {results.map((r, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => pick(r)} style={dropdownItem}>
                      {r.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected && (
              <div style={{ fontSize: 12, color: "#059669", marginTop: 4 }}>
                ✓ {selected.lat.toFixed(3)}, {selected.lng.toFixed(3)}
              </div>
            )}
          </label>

          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ flex: 1 }}>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={input}
              />
            </label>
            <label style={{ flex: 1 }}>
              End date
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={input}
              />
            </label>
          </div>

          <label>
            Currency
            <select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              style={input}
            >
              {["USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "CHF", "CNY", "SGD", "THB", "AED"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: "#6b7280", marginTop: 4, display: "block" }}>
              All expenses for this trip will be tracked in this currency.
            </span>
          </label>

          {error && <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>
              Cancel
            </button>
            <button type="submit" disabled={createTrip.isPending} style={primaryBtn}>
              {createTrip.isPending ? "Creating…" : "Create trip"}
            </button>
          </div>
        </form>
        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
          Location data © OpenStreetMap contributors
        </p>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 100,
  padding: 16,
};
const modal: React.CSSProperties = {
  background: "white",
  borderRadius: 12,
  padding: 24,
  width: "min(480px, 100%)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxHeight: "90vh",
  overflow: "auto",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  marginTop: 4,
  border: "1px solid #d1d5db",
  borderRadius: 6,
};
const dropdown: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  background: "white",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  marginTop: 4,
  listStyle: "none",
  padding: 0,
  maxHeight: 220,
  overflow: "auto",
  zIndex: 10,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};
const dropdownItem: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "8px 10px",
  border: 0,
  background: "white",
  cursor: "pointer",
  fontSize: 14,
};
const primaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: 0,
  background: "#111827",
  color: "white",
  cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
};
const closeBtn: React.CSSProperties = {
  border: 0,
  background: "transparent",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
  color: "#6b7280",
};

import { Link } from "react-router-dom";
import { Trip } from "../lib/trips";

type Props = {
  trips: Trip[];
};

function formatRange(trip: Trip): string {
  const s = trip.startDate ? new Date(trip.startDate) : null;
  const e = trip.endDate ? new Date(trip.endDate) : null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (s && e) return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  if (s) return s.toLocaleDateString(undefined, opts);
  return "Undated";
}

export default function MemoryStatusBar({ trips }: Props) {
  const sorted = [...trips].sort((a, b) => {
    const da = a.startDate ? Date.parse(a.startDate) : 0;
    const db = b.startDate ? Date.parse(b.startDate) : 0;
    return db - da;
  });

  if (sorted.length === 0) {
    return (
      <div style={{ padding: 24, color: "#6b7280", textAlign: "center" }}>
        No trips yet. Click <strong>Add trip</strong> to drop your first pin.
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        padding: "12px 4px",
        scrollbarWidth: "thin",
      }}
    >
      {sorted.map((t) => (
        <Link
          key={t.id}
          to={`/trips/${t.id}`}
          style={{
            flex: "0 0 220px",
            padding: 14,
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            color: "inherit",
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            transition: "transform 0.1s",
          }}
          onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
          onMouseOut={(e) => (e.currentTarget.style.transform = "none")}
        >
          <strong style={{ fontSize: 15 }}>{t.title}</strong>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {t.location.name}
            {t.location.country ? `, ${t.location.country}` : ""}
          </span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{formatRange(t)}</span>
        </Link>
      ))}
    </div>
  );
}

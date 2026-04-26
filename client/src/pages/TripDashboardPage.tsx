import { Link, useNavigate, useParams } from "react-router-dom";
import ExpensePanel from "../components/ExpensePanel";
import Gallery from "../components/Gallery";
import TimelinePanel from "../components/TimelinePanel";
import UploadDropzone from "../components/UploadDropzone";
import { apiErrorMessage } from "../lib/api";
import { useMediaList } from "../lib/media";
import { useDeleteTrip, useTrip, useUpdateTrip } from "../lib/trips";

const CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "CHF", "CNY", "SGD", "THB", "AED",
];

export default function TripDashboardPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const { data: trip, isLoading, error } = useTrip(tripId);
  const { data: media = [], isLoading: mediaLoading } = useMediaList(tripId);
  const deleteTrip = useDeleteTrip();
  const updateTrip = useUpdateTrip(tripId);

  if (isLoading) return <div style={centered}>Loading trip…</div>;
  if (error || !trip) {
    return (
      <div style={centered}>
        <p style={{ color: "#b91c1c" }}>{apiErrorMessage(error, "Trip not found")}</p>
        <Link to="/">← Back to globe</Link>
      </div>
    );
  }

  async function onDelete() {
    if (!trip) return;
    if (!confirm(`Delete "${trip.title}"? This cannot be undone.`)) return;
    try {
      await deleteTrip.mutateAsync(trip.id);
      navigate("/");
    } catch (err) {
      alert(apiErrorMessage(err, "Could not delete trip"));
    }
  }

  const start = trip.startDate ? new Date(trip.startDate).toLocaleDateString() : null;
  const end = trip.endDate ? new Date(trip.endDate).toLocaleDateString() : null;

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/" style={{ fontSize: 14 }}>
          ← Back to globe
        </Link>
        <button onClick={onDelete} style={deleteBtn} disabled={deleteTrip.isPending}>
          {deleteTrip.isPending ? "Deleting…" : "Delete trip"}
        </button>
      </header>

      <div>
        <h1 style={{ margin: 0 }}>{trip.title}</h1>
        <p style={{ color: "#6b7280", marginTop: 4 }}>
          {trip.location.name}
          {trip.location.country ? `, ${trip.location.country}` : ""}
          {start && end ? ` · ${start} – ${end}` : start ? ` · ${start}` : ""}
        </p>
      </div>

      <section style={placeholderCard}>
        <h3 style={{ margin: 0 }}>Gallery</h3>
        <UploadDropzone tripId={trip.id} />
        {mediaLoading ? (
          <div style={{ color: "#6b7280" }}>Loading media…</div>
        ) : (
          <Gallery tripId={trip.id} media={media} />
        )}
      </section>
      <section style={placeholderCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Expenses</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280" }}>
            Currency
            <select
              value={trip.defaultCurrency}
              onChange={async (e) => {
                const next = e.target.value;
                if (next === trip.defaultCurrency) return;
                try {
                  await updateTrip.mutateAsync({ defaultCurrency: next });
                } catch (err) {
                  alert(apiErrorMessage(err, "Could not change currency"));
                }
              }}
              disabled={updateTrip.isPending}
              style={{
                padding: "4px 8px",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {CURRENCIES.includes(trip.defaultCurrency)
                ? null
                : <option value={trip.defaultCurrency}>{trip.defaultCurrency}</option>}
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <ExpensePanel tripId={trip.id} tripCurrency={trip.defaultCurrency} />
      </section>
      <section style={placeholderCard}>
        <h3 style={{ margin: 0 }}>Timeline</h3>
        <TimelinePanel tripId={trip.id} />
      </section>
    </div>
  );
}

const centered: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  gap: 12,
};
const placeholderCard: React.CSSProperties = {
  padding: 20,
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const deleteBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #fecaca",
  background: "white",
  color: "#b91c1c",
  cursor: "pointer",
};

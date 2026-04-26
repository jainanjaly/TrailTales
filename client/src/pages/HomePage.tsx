import { useEffect, useState } from "react";
import AddTripModal from "../components/AddTripModal";
import MemoryStatusBar from "../components/MemoryStatusBar";
import TripGlobe from "../components/TripGlobe";
import { api } from "../lib/api";
import { useAuthStore, User } from "../lib/auth";
import { useTrips } from "../lib/trips";

export default function HomePage() {
  const { user, setUser, clear } = useAuthStore();
  const { data: trips = [], isLoading, error } = useTrips();
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api
      .get<{ user: User }>("/auth/me")
      .then((r) => setUser(r.data.user))
      .catch(() => {
        /* interceptor handles 401 */
      });
  }, [setUser]);

  return (
    <div style={{ minHeight: "100vh", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1 style={{ margin: 0 }}>TrailTales</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "#374151" }}>Hi, {user?.displayName}</span>
          <button onClick={() => setShowAdd(true)} style={primaryBtn}>
            + Add trip
          </button>
          <button onClick={clear} style={secondaryBtn}>
            Sign out
          </button>
        </div>
      </header>

      <section style={{ height: "60vh", minHeight: 420 }}>
        {isLoading ? (
          <div style={centered}>Loading your trips…</div>
        ) : error ? (
          <div style={{ ...centered, color: "#b91c1c" }}>Couldn't load trips.</div>
        ) : (
          <TripGlobe trips={trips} />
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 16, color: "#374151", margin: "4px 0" }}>Memory timeline</h2>
        <MemoryStatusBar trips={trips} />
      </section>

      {showAdd && <AddTripModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

const centered: React.CSSProperties = {
  height: "100%",
  display: "grid",
  placeItems: "center",
  color: "#6b7280",
  background: "#f3f4f6",
  borderRadius: 12,
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
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
};

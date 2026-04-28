import { useQuery } from "@tanstack/react-query";
import { ChangeEvent, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiErrorMessage } from "../lib/api";
import { fetchInvite, uploadAsGuest } from "../lib/collab";
import { UploadError, UploadProgress } from "../lib/upload";

type QueueItem = { name: string; progress: UploadProgress; error?: string; done?: boolean };

function describeError(err: unknown): string {
  if (err instanceof UploadError) return err.message;
  return apiErrorMessage(err, "Upload failed");
}

export default function ContributePage() {
  const { token = "" } = useParams<{ token: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["invite", token],
    enabled: !!token,
    queryFn: () => fetchInvite(token),
    retry: false,
  });

  const [guestName, setGuestName] = useState("");
  const [nameLocked, setNameLocked] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (isLoading) return <div style={centered}>Loading invite…</div>;
  if (error || !data) {
    return (
      <div style={centered}>
        <h2>Invite unavailable</h2>
        <p style={{ color: "#6b7280", maxWidth: 400, textAlign: "center" }}>
          {apiErrorMessage(error, "This invite link is invalid, expired, or has been revoked.")}
        </p>
        <Link to="/login">Go to TrailTales</Link>
      </div>
    );
  }

  const trip = data.trip;
  const start = trip.startDate ? new Date(trip.startDate).toLocaleDateString() : null;
  const end = trip.endDate ? new Date(trip.endDate).toLocaleDateString() : null;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (!guestName.trim()) {
      alert("Please enter your name first.");
      return;
    }
    setNameLocked(true);
    setBusy(true);
    const arr = Array.from(files);
    const startIdx = queue.length;
    setQueue((q) => [
      ...q,
      ...arr.map((f) => ({ name: f.name, progress: { stage: "thumbnail" as const, percent: 0 } })),
    ]);

    for (let i = 0; i < arr.length; i++) {
      const idx = startIdx + i;
      try {
        await uploadAsGuest(token, guestName.trim(), arr[i], (p) => {
          setQueue((q) => q.map((item, ii) => (ii === idx ? { ...item, progress: p } : item)));
        });
        setQueue((q) => q.map((item, ii) => (ii === idx ? { ...item, done: true } : item)));
      } catch (err) {
        setQueue((q) =>
          q.map((item, ii) =>
            ii === idx ? { ...item, error: describeError(err) } : item,
          ),
        );
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div style={page}>
      <div style={card}>
        <header style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0, textTransform: "uppercase", letterSpacing: 0.6 }}>
            You're invited to contribute
          </p>
          <h1 style={{ margin: "4px 0 0" }}>{trip.title}</h1>
          <p style={{ color: "#6b7280", margin: "4px 0 0" }}>
            by {data.ownerName} · {trip.location.name}
            {trip.location.country ? `, ${trip.location.country}` : ""}
            {start && end ? ` · ${start} – ${end}` : start ? ` · ${start}` : ""}
          </p>
        </header>

        <p style={{ fontSize: 14, color: "#374151" }}>
          Share photos or videos from this trip. The trip owner will review your
          submissions before they appear in the gallery.
        </p>

        <label style={field}>
          Your name
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="e.g. Alex Smith"
            maxLength={80}
            disabled={nameLocked}
            style={input}
          />
        </label>

        <label style={{ ...dropzone, opacity: guestName.trim() ? 1 : 0.5 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            style={{ display: "none" }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onFiles(e.target.files)}
            disabled={busy || !guestName.trim()}
          />
          <div style={{ fontWeight: 600 }}>+ Choose photos or videos</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Max 10 MB per photo, 50 MB per video.
          </div>
        </label>

        {queue.length > 0 && (
          <ul style={list}>
            {queue.map((item, i) => (
              <li key={i} style={listRow}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "50%" }}>
                    {item.name}
                  </span>
                  <span style={{
                    color: item.error ? "#b91c1c" : item.done ? "#166534" : "#6b7280",
                    textAlign: "right",
                  }}>
                    {item.error
                      ? item.error
                      : item.done
                        ? "Submitted ✓"
                        : `${item.progress.stage} · ${Math.round(item.progress.percent)}%`}
                  </span>
                </div>
                {!item.error && !item.done && (
                  <div style={bar}>
                    <div style={{ ...barFill, width: `${item.progress.percent}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 12 }}>
          This invite was sent to {data.guestEmail} and expires{" "}
          {new Date(data.expiresAt).toLocaleDateString()}.
        </p>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  background: "#f9fafb",
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 640,
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const centered: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  gap: 12,
};
const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#374151",
};
const input: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
};
const dropzone: React.CSSProperties = {
  display: "block",
  padding: 24,
  border: "2px dashed #d1d5db",
  borderRadius: 10,
  textAlign: "center",
  cursor: "pointer",
  background: "#fafafa",
};
const list: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "8px 0 0",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const listRow: React.CSSProperties = {
  padding: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "white",
};
const bar: React.CSSProperties = {
  height: 4,
  background: "#f3f4f6",
  borderRadius: 2,
  marginTop: 6,
  overflow: "hidden",
};
const barFill: React.CSSProperties = {
  height: "100%",
  background: "#111827",
  transition: "width 0.2s",
};

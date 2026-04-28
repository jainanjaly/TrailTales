import { useState } from "react";
import { apiErrorMessage } from "../lib/api";
import { Media } from "../lib/media";
import { Reel, useDeleteReel, useReels } from "../lib/reels";
import CreateReelModal from "./CreateReelModal";

type Props = {
  tripId: string;
  media: Media[];
};

export default function ReelPanel({ tripId, media }: Props) {
  const { data: reels = [], isLoading } = useReels(tripId);
  const [showModal, setShowModal] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          Generate a short highlight reel from your trip media.
        </p>
        <button
          onClick={() => setShowModal(true)}
          style={primaryBtn}
          disabled={media.length === 0}
          title={media.length === 0 ? "Upload media first" : ""}
        >
          + New reel
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>Loading reels…</div>
      ) : reels.length === 0 ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>No reels yet.</div>
      ) : (
        <ul style={list}>
          {reels.map((r) => (
            <ReelRow key={r.id} reel={r} tripId={tripId} />
          ))}
        </ul>
      )}

      {showModal && (
        <CreateReelModal
          tripId={tripId}
          media={media}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function ReelRow({ reel, tripId }: { reel: Reel; tripId: string }) {
  const del = useDeleteReel(tripId);

  async function onDelete() {
    if (!confirm(`Delete "${reel.title}"?`)) return;
    try {
      await del.mutateAsync(reel.id);
    } catch (err) {
      alert(apiErrorMessage(err, "Could not delete reel"));
    }
  }

  return (
    <li style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{reel.title}</strong>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            {reel.style} · {reel.mediaIds.length} clip
            {reel.mediaIds.length === 1 ? "" : "s"}
            {reel.musicTrackId ? ` · ♪ ${reel.musicTrackId}` : ""}
            {reel.durationSec ? ` · ${reel.durationSec.toFixed(1)}s` : ""}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...statusBadge, ...statusColor(reel.status) }}>
            {reel.status}
          </span>
          <button onClick={onDelete} disabled={del.isPending} style={dangerBtn}>
            Delete
          </button>
        </div>
      </div>

      {reel.status === "ready" && reel.downloadUrl && (
        <video
          src={reel.downloadUrl}
          controls
          playsInline
          style={video}
        />
      )}

      {reel.status === "rendering" && (
        <div style={{ ...progressNote }}>
          Rendering… this can take 30–60 seconds for short reels.
        </div>
      )}
      {reel.status === "queued" && (
        <div style={{ ...progressNote }}>Queued…</div>
      )}
      {reel.status === "failed" && (
        <div style={errorNote}>
          {reel.errorMessage || "Render failed."}
        </div>
      )}
    </li>
  );
}

function statusColor(status: string): React.CSSProperties {
  if (status === "ready") return { background: "#dcfce7", color: "#166534" };
  if (status === "rendering" || status === "queued")
    return { background: "#dbeafe", color: "#1e40af" };
  if (status === "failed") return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#f3f4f6", color: "#6b7280" };
}

const list: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "white",
};
const video: React.CSSProperties = {
  width: "100%",
  maxHeight: 360,
  borderRadius: 8,
  background: "black",
};
const progressNote: React.CSSProperties = {
  fontSize: 13,
  color: "#1e40af",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  padding: "6px 10px",
};
const errorNote: React.CSSProperties = {
  fontSize: 13,
  color: "#991b1b",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 6,
  padding: "6px 10px",
};
const primaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  cursor: "pointer",
};
const dangerBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid #fecaca",
  background: "white",
  color: "#b91c1c",
  cursor: "pointer",
  fontSize: 12,
};
const statusBadge: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  textTransform: "uppercase",
  fontWeight: 600,
  letterSpacing: 0.4,
};

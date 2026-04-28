import { apiErrorMessage } from "../lib/api";
import {
  PendingMedia,
  useAcceptMedia,
  useDeclineMedia,
  usePendingMedia,
} from "../lib/collab";

type Props = { tripId: string };

export default function PendingPanel({ tripId }: Props) {
  const { data: pending = [], isLoading } = usePendingMedia(tripId);
  const accept = useAcceptMedia(tripId);
  const decline = useDeclineMedia(tripId);

  if (isLoading) {
    return <div style={{ color: "#6b7280", fontSize: 13 }}>Loading pending…</div>;
  }
  if (pending.length === 0) {
    return (
      <div style={{ color: "#6b7280", fontSize: 13 }}>
        No pending submissions. Contributions from invited guests will appear here.
      </div>
    );
  }

  return (
    <ul style={grid}>
      {pending.map((m) => (
        <PendingCard
          key={m.id}
          media={m}
          onAccept={async () => {
            try {
              await accept.mutateAsync(m.id);
            } catch (err) {
              alert(apiErrorMessage(err, "Could not accept"));
            }
          }}
          onDecline={async () => {
            if (!confirm("Decline and permanently delete this submission?")) return;
            try {
              await decline.mutateAsync(m.id);
            } catch (err) {
              alert(apiErrorMessage(err, "Could not decline"));
            }
          }}
          busy={accept.isPending || decline.isPending}
        />
      ))}
    </ul>
  );
}

function PendingCard({
  media,
  onAccept,
  onDecline,
  busy,
}: {
  media: PendingMedia;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}) {
  const preview = media.thumbnailUrl ?? media.url;
  return (
    <li style={card}>
      <div style={previewBox}>
        {media.type === "video" ? (
          preview ? (
            <img src={preview} alt="" style={previewImg} />
          ) : (
            <div style={placeholder}>video</div>
          )
        ) : preview ? (
          <img src={preview} alt="" style={previewImg} />
        ) : (
          <div style={placeholder}>photo</div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {media.guestName ?? "Anonymous"}
        </span>
        {media.guestEmail && (
          <span style={{ fontSize: 11, color: "#6b7280" }}>{media.guestEmail}</span>
        )}
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          {new Date(media.createdAt).toLocaleString()}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onAccept} disabled={busy} style={acceptBtn}>
          Accept
        </button>
        <button onClick={onDecline} disabled={busy} style={declineBtn}>
          Decline
        </button>
      </div>
    </li>
  );
}

const grid: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
  gap: 12,
};
const card: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: "1px solid #fde68a",
  background: "#fffbeb",
  borderRadius: 10,
};
const previewBox: React.CSSProperties = {
  width: "100%",
  aspectRatio: "1",
  background: "#f3f4f6",
  borderRadius: 8,
  overflow: "hidden",
};
const previewImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};
const placeholder: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  color: "#6b7280",
  fontSize: 12,
  textTransform: "uppercase",
};
const acceptBtn: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #16a34a",
  background: "#16a34a",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
};
const declineBtn: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #fecaca",
  background: "white",
  color: "#b91c1c",
  cursor: "pointer",
  fontSize: 13,
};

import { useState } from "react";
import { apiErrorMessage } from "../lib/api";
import { Media } from "../lib/media";
import {
  CreateReelInput,
  ReelStyle,
  useCreateReel,
  useMusicTracks,
} from "../lib/reels";

type Props = {
  tripId: string;
  media: Media[];
  onClose: () => void;
};

const MAX_CLIPS = 30;
const STYLES: { id: ReelStyle; label: string; description: string }[] = [
  {
    id: "classic",
    label: "Classic",
    description: "3 s per photo, smooth crossfade transitions, slow pace.",
  },
  {
    id: "punchy",
    label: "Punchy",
    description: "1.5 s per photo, hard cuts, energetic.",
  },
];

export default function CreateReelModal({ tripId, media, onClose }: Props) {
  const create = useCreateReel(tripId);
  const { data: tracks = [], isLoading: tracksLoading } = useMusicTracks();
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState<ReelStyle>("classic");
  const [musicTrackId, setMusicTrackId] = useState<string | "">("");
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_CLIPS) return prev;
      return [...prev, id];
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.length === 0) {
      alert("Pick at least one photo or video.");
      return;
    }
    const input: CreateReelInput = {
      title: title.trim() || undefined,
      style,
      musicTrackId: musicTrackId || null,
      mediaIds: selected,
    };
    try {
      await create.mutateAsync(input);
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, "Could not start reel render"));
    }
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <form
        onSubmit={onSubmit}
        style={modal}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Create reel</h2>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            ×
          </button>
        </header>

        <label style={field}>
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Trip reel"
            maxLength={120}
            style={input}
          />
        </label>

        <div style={field}>
          <span>Style</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STYLES.map((s) => {
              const active = s.id === style;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  style={active ? styleCardActive : styleCard}
                >
                  <strong>{s.label}</strong>
                  <span style={{ fontSize: 12, color: active ? "#1f2937" : "#6b7280" }}>
                    {s.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <label style={field}>
          Background music
          <select
            value={musicTrackId}
            onChange={(e) => setMusicTrackId(e.target.value)}
            style={input}
            disabled={tracksLoading}
          >
            <option value="">No music (silent)</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {!tracksLoading && tracks.length === 0 && (
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              No music tracks available — add audio files to{" "}
              <code>server/app/assets/music/</code>.
            </span>
          )}
        </label>

        <div style={field}>
          <span>
            Pick media in order ({selected.length} / {MAX_CLIPS})
          </span>
          {media.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Upload some photos or videos first.
            </div>
          ) : (
            <ul style={mediaGrid}>
              {media.map((m) => {
                const idx = selected.indexOf(m.id);
                const active = idx >= 0;
                const preview = m.thumbnailUrl ?? (m.type === "photo" ? m.url : undefined);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      style={{ ...mediaTile, ...(active ? mediaTileActive : null) }}
                      aria-label={active ? "Deselect" : "Select"}
                    >
                      {preview ? (
                        <img src={preview} alt="" style={mediaImg} loading="lazy" />
                      ) : (
                        <div style={{ ...mediaImg, display: "grid", placeItems: "center", color: "#6b7280", fontSize: 12 }}>
                          {m.type}
                        </div>
                      )}
                      {active && <div style={orderBadge}>{idx + 1}</div>}
                      {m.type === "video" && <div style={videoBadge}>▶</div>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={cancelBtn}>
            Cancel
          </button>
          <button type="submit" style={primaryBtn} disabled={create.isPending || selected.length === 0}>
            {create.isPending ? "Starting…" : "Generate reel"}
          </button>
        </footer>
      </form>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 100,
  padding: 16,
};
const modal: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  maxHeight: "90vh",
  background: "white",
  borderRadius: 12,
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  overflow: "auto",
};
const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  color: "#374151",
};
const input: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
};
const closeBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  fontSize: 24,
  cursor: "pointer",
  color: "#6b7280",
  lineHeight: 1,
};
const styleCard: React.CSSProperties = {
  flex: "1 1 200px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 4,
  padding: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
  textAlign: "left",
};
const styleCardActive: React.CSSProperties = {
  ...styleCard,
  border: "2px solid #111827",
  background: "#f9fafb",
};
const mediaGrid: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
  gap: 8,
};
const mediaTile: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "1",
  padding: 0,
  border: "2px solid transparent",
  borderRadius: 8,
  overflow: "hidden",
  background: "#f3f4f6",
  cursor: "pointer",
};
const mediaTileActive: React.CSSProperties = {
  border: "2px solid #2563eb",
};
const mediaImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};
const orderBadge: React.CSSProperties = {
  position: "absolute",
  top: 4,
  left: 4,
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "#2563eb",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  fontWeight: 700,
};
const videoBadge: React.CSSProperties = {
  position: "absolute",
  bottom: 4,
  right: 4,
  background: "rgba(0,0,0,0.6)",
  color: "white",
  borderRadius: 4,
  fontSize: 11,
  padding: "1px 5px",
};
const primaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  cursor: "pointer",
};
const cancelBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "white",
  color: "#374151",
  cursor: "pointer",
};

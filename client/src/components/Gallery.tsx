import { useEffect, useRef, useState } from "react";
import { Media, useDeleteMedia, useUpdateMediaNote } from "../lib/media";
import { apiErrorMessage } from "../lib/api";

type Props = {
  tripId: string;
  media: Media[];
};

export default function Gallery({ tripId, media }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = media.find((m) => m.id === activeId) ?? null;

  if (media.length === 0) {
    return (
      <div style={{ padding: 24, color: "#6b7280", textAlign: "center", border: "1px dashed #e5e7eb", borderRadius: 10 }}>
        No media yet. Upload photos or videos to get started.
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 10,
        }}
      >
        {media.map((m) => {
          // Photos no longer get a separate thumbnail — display the original
          // file directly (browser scales it via object-fit: cover).
          const previewUrl =
            m.thumbnailUrl ?? (m.type === "photo" ? m.url : undefined);
          return (
            <button
              key={m.id}
              onClick={() => setActiveId(m.id)}
              style={thumbBtn}
              aria-label={`Open ${m.type}`}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="" style={thumbImg} loading="lazy" />
              ) : (
                <div style={{ ...thumbImg, background: "#e5e7eb", display: "grid", placeItems: "center", color: "#6b7280", fontSize: 12 }}>
                  {m.type}
                </div>
              )}
              {m.type === "video" && <div style={videoBadge}>▶</div>}
            </button>
          );
        })}
      </div>

      {active && <Lightbox tripId={tripId} media={active} onClose={() => setActiveId(null)} />}
    </>
  );
}

function Lightbox({
  tripId,
  media,
  onClose,
}: {
  tripId: string;
  media: Media;
  onClose: () => void;
}) {
  const original = media.note ?? "";
  const [note, setNote] = useState(original);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const updateNote = useUpdateMediaNote(tripId);
  const deleteMedia = useDeleteMedia(tripId);

  // Refs let async close handlers see the latest values without stale closures.
  const noteRef = useRef(note);
  const originalRef = useRef(original);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);
  useEffect(() => {
    originalRef.current = original;
  }, [original]);

  const isDirty = note !== original;

  // Reset when switching media
  useEffect(() => {
    setNote(media.note ?? "");
    setSavedAt(null);
    setSaveError(null);
  }, [media.id, media.note]);

  async function saveNote(): Promise<boolean> {
    const current = noteRef.current;
    if (current === originalRef.current) return true;
    try {
      await updateNote.mutateAsync({ mediaId: media.id, note: current });
      setSavedAt(Date.now());
      setSaveError(null);
      return true;
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Couldn't save note"));
      return false;
    }
  }

  // Close on Escape (saves first if dirty)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") void handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save on tab close / refresh as a last resort
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (noteRef.current !== originalRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  async function handleClose() {
    if (noteRef.current !== originalRef.current) {
      const ok = await saveNote();
      if (!ok) {
        const proceed = confirm(
          "Note couldn't be saved. Close anyway and discard changes?",
        );
        if (!proceed) return;
      }
    }
    onClose();
  }

  async function onDelete() {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    try {
      await deleteMedia.mutateAsync(media.id);
      onClose();
    } catch (err) {
      alert(apiErrorMessage(err, "Couldn't delete"));
    }
  }

  return (
    <div style={backdrop} onClick={() => void handleClose()}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => void handleClose()} style={closeBtn} aria-label="Close">
          ×
        </button>
        <div style={mediaWrap}>
          {media.type === "photo" ? (
            <img src={media.url} alt="" style={mediaEl} />
          ) : (
            <video src={media.url} controls playsInline style={mediaEl} />
          )}
        </div>
        <div style={sidebar}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <span style={{ fontWeight: 600 }}>Memory note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What made this moment special?"
              style={textarea}
              maxLength={2000}
            />
            <span style={{ fontSize: 12, color: saveError ? "#b91c1c" : "#6b7280" }}>
              {saveError
                ? saveError
                : updateNote.isPending
                  ? "Saving…"
                  : isDirty
                    ? "Unsaved changes"
                    : savedAt
                      ? "Saved"
                      : " "}
            </span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void saveNote()}
              disabled={!isDirty || updateNote.isPending}
              style={saveBtn}
            >
              {updateNote.isPending ? "Saving…" : "Save"}
            </button>
            <button onClick={onDelete} style={deleteBtn} disabled={deleteMedia.isPending}>
              {deleteMedia.isPending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const thumbBtn: React.CSSProperties = {
  position: "relative",
  aspectRatio: "1",
  padding: 0,
  border: 0,
  borderRadius: 8,
  overflow: "hidden",
  cursor: "pointer",
  background: "#f3f4f6",
};
const thumbImg: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};
const videoBadge: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  right: 6,
  background: "rgba(17,24,39,0.8)",
  color: "white",
  fontSize: 12,
  padding: "2px 6px",
  borderRadius: 4,
};
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.85)",
  display: "grid",
  placeItems: "center",
  zIndex: 100,
  padding: 16,
};
const panel: React.CSSProperties = {
  position: "relative",
  background: "white",
  borderRadius: 12,
  width: "min(1100px, 100%)",
  maxHeight: "90vh",
  display: "grid",
  gridTemplateColumns: "1fr 320px",
  overflow: "hidden",
};
const closeBtn: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 32,
  height: 32,
  border: 0,
  borderRadius: "50%",
  background: "rgba(0,0,0,0.4)",
  color: "white",
  fontSize: 20,
  cursor: "pointer",
  zIndex: 1,
};
const mediaWrap: React.CSSProperties = {
  background: "#000",
  display: "grid",
  placeItems: "center",
  minHeight: 320,
};
const mediaEl: React.CSSProperties = {
  maxWidth: "100%",
  maxHeight: "85vh",
  display: "block",
};
const sidebar: React.CSSProperties = {
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  borderLeft: "1px solid #e5e7eb",
};
const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 180,
  padding: 10,
  border: "1px solid #d1d5db",
  borderRadius: 6,
  resize: "vertical",
  fontFamily: "inherit",
  fontSize: 14,
};
const deleteBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #fecaca",
  background: "white",
  color: "#b91c1c",
  cursor: "pointer",
};
const saveBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: 0,
  background: "#111827",
  color: "white",
  cursor: "pointer",
};

import { FormEvent, useState } from "react";
import { apiErrorMessage } from "../lib/api";
import {
  useCreateTimelineEntry,
  useDeleteTimelineEntry,
  useTimeline,
} from "../lib/timeline";

type Props = { tripId: string };

export default function TimelinePanel({ tripId }: Props) {
  const { data: entries = [], isLoading } = useTimeline(tripId);
  const createEntry = useCreateTimelineEntry(tripId);
  const deleteEntry = useDeleteTimelineEntry(tripId);

  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError("Title is required");
      return;
    }
    try {
      await createEntry.mutateAsync({
        date: new Date(date).toISOString(),
        title: title.trim(),
        description: description.trim(),
      });
      setTitle("");
      setDescription("");
      setShowForm(false);
    } catch (err) {
      setFormError(apiErrorMessage(err, "Could not add entry"));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Add entry toggle */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={addBtn}>
          + Add moment
        </button>
      ) : (
        <form onSubmit={onSubmit} style={formStyle}>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: "0 0 160px" }}>
              <span style={labelStyle}>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
                required
              />
            </label>
            <label style={{ flex: 1 }}>
              <span style={labelStyle}>Title</span>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Hiked Mount Fuji"
                style={inputStyle}
                maxLength={200}
                required
              />
            </label>
          </div>
          <label>
            <span style={labelStyle}>Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? How did it feel?"
              style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
              maxLength={2000}
            />
          </label>
          {formError && <div style={{ color: "#b91c1c", fontSize: 13 }}>{formError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={createEntry.isPending} style={primaryBtn}>
              {createEntry.isPending ? "Adding…" : "Add moment"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Timeline */}
      {isLoading ? (
        <div style={{ color: "#6b7280" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ color: "#9ca3af", fontSize: 14 }}>
          No moments yet. Add the highlights of your trip.
        </div>
      ) : (
        <ol style={{ padding: 0, margin: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
          {entries.map((entry, i) => (
            <li key={entry.id} style={{ display: "flex", gap: 12 }}>
              {/* Spine */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#111827", marginTop: 6, flexShrink: 0 }} />
                {i < entries.length - 1 && (
                  <div style={{ flex: 1, width: 2, background: "#e5e7eb", marginTop: 4 }} />
                )}
              </div>
              {/* Content */}
              <div style={{ flex: 1, paddingBottom: i < entries.length - 1 ? 20 : 0 }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>
                  {new Date(entry.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <strong style={{ fontSize: 15 }}>{entry.title}</strong>
                  <button
                    onClick={() => deleteEntry.mutate(entry.id)}
                    style={deleteBtn}
                    aria-label="Delete"
                    disabled={deleteEntry.isPending}
                  >
                    ✕
                  </button>
                </div>
                {entry.description && (
                  <p style={{ margin: "4px 0 0", fontSize: 14, color: "#374151", whiteSpace: "pre-wrap" }}>
                    {entry.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#6b7280",
  marginBottom: 3,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 14,
};
const addBtn: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px dashed #d1d5db",
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
const deleteBtn: React.CSSProperties = {
  padding: "4px 8px",
  border: 0,
  background: "transparent",
  color: "#9ca3af",
  cursor: "pointer",
  fontSize: 14,
};

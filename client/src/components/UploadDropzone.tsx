import { useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, useRef, useState } from "react";
import { apiErrorMessage } from "../lib/api";
import { UploadError, UploadProgress, uploadMedia } from "../lib/upload";

type Props = {
  tripId: string;
};

function describeError(err: unknown): string {
  if (err instanceof UploadError) {
    const prefix: Record<UploadError["kind"], string> = {
      "unsupported-format": "Unsupported format",
      "too-large": "File too large",
      "quota-exceeded": "Storage quota exceeded",
      network: "Network error",
      server: "Server error",
      unknown: "Upload failed",
    };
    return `${prefix[err.kind]}: ${err.message}`;
  }
  return apiErrorMessage(err, "Upload failed");
}

export default function UploadDropzone({ tripId }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [queue, setQueue] = useState<
    { name: string; progress: UploadProgress; error?: string }[]
  >([]);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const arr = Array.from(files);
    setQueue(arr.map((f) => ({ name: f.name, progress: { stage: "thumbnail", percent: 0 } })));

    let anyFailed = false;
    for (let i = 0; i < arr.length; i++) {
      try {
        await uploadMedia(tripId, arr[i], (p) => {
          setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, progress: p } : item)));
        });
      } catch (err) {
        anyFailed = true;
        const message = describeError(err);
        setQueue((q) =>
          q.map((item, idx) => (idx === i ? { ...item, error: message } : item)),
        );
      }
    }

    qc.invalidateQueries({ queryKey: ["media", tripId] });
    setBusy(false);
    // Keep failure messages visible longer so users can read them.
    setTimeout(() => setQueue([]), anyFailed ? 8000 : 2000);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <label style={dropzone}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: "none" }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onFiles(e.target.files)}
          disabled={busy}
        />
        <div style={{ fontWeight: 600 }}>+ Upload photos or videos</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Max 10 MB per photo, 50 MB per video. Up to 500 MB total.
        </div>
      </label>

      {queue.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 8 }}>
          {queue.map((item, i) => (
            <li key={i} style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8, background: "white" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "0 1 auto", maxWidth: "40%" }}>
                  {item.name}
                </span>
                <span style={{ color: item.error ? "#b91c1c" : "#6b7280", textAlign: "right", flex: "1 1 auto" }}>
                  {item.error ? item.error : `${item.progress.stage} · ${Math.round(item.progress.percent)}%`}
                </span>
              </div>
              {!item.error && (
                <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${item.progress.percent}%`,
                      height: "100%",
                      background: "#111827",
                      transition: "width 0.2s",
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const dropzone: React.CSSProperties = {
  display: "block",
  padding: 20,
  border: "2px dashed #d1d5db",
  borderRadius: 10,
  textAlign: "center",
  cursor: "pointer",
  background: "#fafafa",
};

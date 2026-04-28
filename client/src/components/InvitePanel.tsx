import { useState } from "react";
import { apiErrorMessage } from "../lib/api";
import {
  Invite,
  useCreateInvite,
  useInvites,
  useRevokeInvite,
} from "../lib/collab";

type Props = { tripId: string };

export default function InvitePanel({ tripId }: Props) {
  const { data: invites = [], isLoading } = useInvites(tripId);
  const create = useCreateInvite(tripId);
  const revoke = useRevokeInvite(tripId);
  const [email, setEmail] = useState("");
  const [lastLink, setLastLink] = useState<
    { email: string; url: string; emailSent: boolean; emailConfigured: boolean } | null
  >(null);
  const [copied, setCopied] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      const res = await create.mutateAsync(email.trim());
      setLastLink({
        email: res.invite.email,
        url: res.inviteUrl,
        emailSent: res.emailSent,
        emailConfigured: res.emailConfigured,
      });
      setEmail("");
    } catch (err) {
      alert(apiErrorMessage(err, "Could not create invite"));
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(`Copy failed. Link:\n${url}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <form onSubmit={onCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="email"
          required
          placeholder="guest@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={input}
          disabled={create.isPending}
        />
        <button type="submit" style={primaryBtn} disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create invite link"}
        </button>
      </form>

      {lastLink && (
        <div style={linkBox}>
          <div style={{ fontSize: 13, color: "#374151" }}>
            {lastLink.emailSent ? (
              <>
                ✉️ Invite emailed to <strong>{lastLink.email}</strong>. You can also copy the link below as a backup.
              </>
            ) : lastLink.emailConfigured ? (
              <>
                We couldn’t deliver the email to <strong>{lastLink.email}</strong> right now — share this link manually (it’s shown only once).
              </>
            ) : (
              <>
                Share this link with <strong>{lastLink.email}</strong>. Email delivery isn’t configured on the server, so copy it now — it’s shown only once.
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={code}>{lastLink.url}</code>
            <button onClick={() => copyLink(lastLink.url)} style={smallBtn}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>Loading invites…</div>
      ) : invites.length === 0 ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>No invites yet.</div>
      ) : (
        <ul style={list}>
          {invites.map((inv) => (
            <InviteRow
              key={inv.id}
              invite={inv}
              onRevoke={async () => {
                if (!confirm(`Revoke invite for ${inv.email}?`)) return;
                try {
                  await revoke.mutateAsync(inv.id);
                } catch (err) {
                  alert(apiErrorMessage(err, "Could not revoke"));
                }
              }}
              revoking={revoke.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  onRevoke,
  revoking,
}: {
  invite: Invite;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const expires = new Date(invite.expiresAt);
  const expired = invite.status === "expired" || expires < new Date();
  const status = invite.status === "active" && expired ? "expired" : invite.status;

  return (
    <li style={row}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
          {invite.email}
        </span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          {invite.uploadCount} upload{invite.uploadCount === 1 ? "" : "s"} ·
          {" "}expires {expires.toLocaleDateString()}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ ...statusBadge, ...statusColor(status) }}>{status}</span>
        {invite.status === "active" && (
          <button onClick={onRevoke} disabled={revoking} style={dangerBtn}>
            Revoke
          </button>
        )}
      </div>
    </li>
  );
}

function statusColor(status: string): React.CSSProperties {
  if (status === "active") return { background: "#dcfce7", color: "#166534" };
  if (status === "revoked") return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#f3f4f6", color: "#6b7280" };
}

const input: React.CSSProperties = {
  flex: "1 1 220px",
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
};
const primaryBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #111827",
  background: "#111827",
  color: "white",
  cursor: "pointer",
};
const smallBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
  fontSize: 12,
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
const linkBox: React.CSSProperties = {
  padding: 12,
  background: "#fefce8",
  border: "1px solid #fde68a",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const code: React.CSSProperties = {
  flex: 1,
  padding: "6px 8px",
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  fontSize: 12,
  overflow: "auto",
  whiteSpace: "nowrap",
};
const list: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "8px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "white",
};
const statusBadge: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  textTransform: "uppercase",
  fontWeight: 600,
  letterSpacing: 0.4,
};

import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore, User } from "../lib/auth";

export default function RegisterPage() {
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (token) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ token: string; user: User }>("/auth/register", {
        email,
        password,
        displayName,
      });
      setAuth(res.data.token, res.data.user);
      navigate("/");
    } catch (err) {
      setError(apiErrorMessage(err, "Registration failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={wrap}>
      <form onSubmit={onSubmit} style={form}>
        <h1 style={{ margin: 0 }}>Create your TrailTales account</h1>
        <label>
          Display name
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={input}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
          />
          <small style={{ color: "#6b7280" }}>Minimum 8 characters.</small>
        </label>
        {error && <div style={errorStyle}>{error}</div>}
        <button type="submit" disabled={submitting} style={button}>
          {submitting ? "Creating…" : "Create account"}
        </button>
        <p style={{ fontSize: 14 }}>
          Already have one? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 16,
};
const form: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  width: 340,
  padding: 24,
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  marginTop: 4,
  border: "1px solid #d1d5db",
  borderRadius: 6,
};
const button: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 6,
  border: 0,
  background: "#111827",
  color: "white",
  cursor: "pointer",
};
const errorStyle: React.CSSProperties = { color: "#b91c1c", fontSize: 14 };

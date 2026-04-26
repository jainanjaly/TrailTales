import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, apiErrorMessage } from "../lib/api";
import { useAuthStore, User } from "../lib/auth";

export default function LoginPage() {
  const { token, setAuth } = useAuthStore();
  const navigate = useNavigate();
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
      const res = await api.post<{ token: string; user: User }>("/auth/login", {
        email,
        password,
      });
      setAuth(res.data.token, res.data.user);
      navigate("/");
    } catch (err) {
      setError(apiErrorMessage(err, "Login failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <form onSubmit={onSubmit} style={styles.form}>
        <h1 style={{ margin: 0 }}>Sign in to TrailTales</h1>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
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
            style={styles.input}
          />
        </label>
        {error && <div style={styles.error}>{error}</div>}
        <button type="submit" disabled={submitting} style={styles.button}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <p style={{ fontSize: 14 }}>
          No account? <Link to="/register">Create one</Link>
        </p>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: 320,
    padding: 24,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
  },
  input: {
    width: "100%",
    padding: "8px 10px",
    marginTop: 4,
    border: "1px solid #d1d5db",
    borderRadius: 6,
  },
  button: {
    padding: "10px 14px",
    borderRadius: 6,
    border: 0,
    background: "#111827",
    color: "white",
    cursor: "pointer",
  },
  error: { color: "#b91c1c", fontSize: 14 },
};

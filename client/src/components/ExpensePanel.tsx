import { FormEvent, useEffect, useState } from "react";
import { apiErrorMessage } from "../lib/api";
import {
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  useCreateExpense,
  useDeleteExpense,
  useExpenses,
  useExpenseSummary,
  useUpdateExpense,
} from "../lib/expenses";

type Props = {
  tripId: string;
  tripCurrency: string;
};

const CATEGORY_EMOJI: Record<ExpenseCategory | string, string> = {
  accommodation: "🏨",
  food: "🍜",
  transport: "✈️",
  activities: "🎭",
  shopping: "🛍️",
  health: "💊",
  other: "📦",
};

export default function ExpensePanel({ tripId, tripCurrency }: Props) {
  const { data: expenses = [], isLoading } = useExpenses(tripId);
  const { data: summary } = useExpenseSummary(tripId);
  const createExpense = useCreateExpense(tripId);
  const updateExpense = useUpdateExpense(tripId);
  const deleteExpense = useDeleteExpense(tripId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("other");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function resetForm() {
    setEditingId(null);
    setAmount("");
    setCategory("other");
    setNote("");
    setSpentAt(new Date().toISOString().slice(0, 10));
    setFormError(null);
  }

  function startEdit(exp: Expense) {
    setEditingId(exp.id);
    setAmount(String(exp.amount));
    setCategory(exp.category);
    setNote(exp.note ?? "");
    setSpentAt(new Date(exp.spentAt).toISOString().slice(0, 10));
    setFormError(null);
    setShowForm(true);
  }

  function cancelForm() {
    resetForm();
    setShowForm(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      setFormError("Enter a valid positive amount");
      return;
    }
    const payload = {
      amount: amt,
      category,
      note,
      spentAt: new Date(spentAt).toISOString(),
    };
    try {
      if (editingId) {
        await updateExpense.mutateAsync({ expenseId: editingId, updates: payload });
      } else {
        await createExpense.mutateAsync(payload);
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      setFormError(
        apiErrorMessage(
          err,
          editingId ? "Could not update expense" : "Could not add expense",
        ),
      );
    }
  }

  // If trip currency changes (rare) make sure the form doesn't keep stale state.
  useEffect(() => {
    setFormError(null);
  }, [tripCurrency]);

  const submitting = createExpense.isPending || updateExpense.isPending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary bar */}
      {summary && summary.grandTotal > 0 && (
        <div style={summaryBar}>
          <span style={{ fontWeight: 700, fontSize: 20 }}>
            {summary.currency ?? tripCurrency}{" "}
            {summary.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {summary.byCategory.map((row) => (
              <span key={row.category} style={pill}>
                {CATEGORY_EMOJI[row.category] ?? "📦"} {row.category}{" "}
                <strong>
                  {row.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add expense toggle */}
      {!showForm ? (
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          style={addBtn}
        >
          + Add expense
        </button>
      ) : (
        <form onSubmit={onSubmit} style={formStyle}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 100px" }}>
              <span style={label}>Amount ({tripCurrency})</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={inputStyle}
                autoFocus
              />
            </label>
            <label style={{ flex: "1 1 120px" }}>
              <span style={label}>Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                style={inputStyle}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_EMOJI[c]} {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: "1 1 100px" }}>
              <span style={label}>Date</span>
              <input
                type="date"
                value={spentAt}
                onChange={(e) => setSpentAt(e.target.value)}
                style={inputStyle}
              />
            </label>
          </div>
          <label>
            <span style={label}>Note (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Ramen at Ichiran"
              style={{ ...inputStyle, width: "100%" }}
              maxLength={500}
            />
          </label>
          {formError && <div style={{ color: "#b91c1c", fontSize: 13 }}>{formError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={submitting} style={primaryBtn}>
              {submitting
                ? editingId
                  ? "Saving…"
                  : "Adding…"
                : editingId
                  ? "Save changes"
                  : "Add"}
            </button>
            <button type="button" onClick={cancelForm} style={secondaryBtn}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Expense list */}
      {isLoading ? (
        <div style={{ color: "#6b7280" }}>Loading expenses…</div>
      ) : expenses.length === 0 ? (
        <div style={{ color: "#9ca3af", fontSize: 14 }}>No expenses logged yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {expenses.map((exp) => (
            <li
              key={exp.id}
              style={{
                ...expenseRow,
                outline: editingId === exp.id ? "2px solid #93c5fd" : undefined,
              }}
            >
              <span style={{ fontSize: 18 }}>{CATEGORY_EMOJI[exp.category] ?? "📦"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {exp.currency} {exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  <span style={{ color: "#6b7280", fontWeight: 400, marginLeft: 8 }}>
                    {exp.category}
                  </span>
                </div>
                {exp.note && <div style={{ fontSize: 13, color: "#6b7280" }}>{exp.note}</div>}
                <div style={{ fontSize: 12, color: "#9ca3af" }}>
                  {new Date(exp.spentAt).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => startEdit(exp)}
                  style={iconBtn}
                  aria-label="Edit"
                  title="Edit"
                  disabled={updateExpense.isPending}
                >
                  ✎
                </button>
                <button
                  onClick={() => {
                    if (editingId === exp.id) cancelForm();
                    deleteExpense.mutate(exp.id);
                  }}
                  style={iconBtn}
                  aria-label="Delete"
                  title="Delete"
                  disabled={deleteExpense.isPending}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const summaryBar: React.CSSProperties = {
  padding: 14,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const pill: React.CSSProperties = {
  padding: "3px 10px",
  background: "white",
  border: "1px solid #d1d5db",
  borderRadius: 20,
  fontSize: 13,
};
const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 14,
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: 10,
};
const label: React.CSSProperties = {
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
const expenseRow: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: 10,
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
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
const iconBtn: React.CSSProperties = {
  padding: "4px 8px",
  border: 0,
  background: "transparent",
  color: "#6b7280",
  cursor: "pointer",
  fontSize: 14,
  borderRadius: 4,
};

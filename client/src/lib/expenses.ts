import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type ExpenseCategory =
  | "accommodation"
  | "food"
  | "transport"
  | "activities"
  | "shopping"
  | "health"
  | "other";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "accommodation",
  "food",
  "transport",
  "activities",
  "shopping",
  "health",
  "other",
];

export type Expense = {
  id: string;
  tripId: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  note: string;
  spentAt: string;
  createdAt: string;
};

export type ExpenseSummary = {
  byCategory: { category: string; total: number; count: number; currency: string }[];
  grandTotal: number;
  currency: string | null;
};

export type ExpenseInput = {
  amount: number;
  currency?: string;
  category: ExpenseCategory;
  note?: string;
  spentAt?: string;
};

export type ExpenseUpdate = Partial<ExpenseInput>;

export function useExpenses(tripId: string | undefined) {
  return useQuery({
    queryKey: ["expenses", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<{ expenses: Expense[] }>(`/trips/${tripId}/expenses`);
      return res.data.expenses;
    },
  });
}

export function useExpenseSummary(tripId: string | undefined) {
  return useQuery({
    queryKey: ["expenses-summary", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const res = await api.get<ExpenseSummary>(`/trips/${tripId}/expenses/summary`);
      return res.data;
    },
  });
}

export function useCreateExpense(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const res = await api.post<{ expense: Expense }>(`/trips/${tripId}/expenses`, input);
      return res.data.expense;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
    },
  });
}

export function useUpdateExpense(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      expenseId,
      updates,
    }: {
      expenseId: string;
      updates: ExpenseUpdate;
    }) => {
      const res = await api.patch<{ expense: Expense }>(
        `/trips/${tripId}/expenses/${expenseId}`,
        updates,
      );
      return res.data.expense;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
    },
  });
}

export function useDeleteExpense(tripId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (expenseId: string) => {
      await api.delete(`/trips/${tripId}/expenses/${expenseId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      qc.invalidateQueries({ queryKey: ["expenses-summary", tripId] });
    },
  });
}

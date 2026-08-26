import { useSyncExternalStore } from "react";
import type { PrdDiscountTierInput, PrdFreeEntryCategory, PrdRateInput, PrdTicketType, TicketFeeInput } from "./pricing";
import { calculatePrdPurchasePricing, formatLocalTicketNumber, STARTING_TICKET_NUMBER } from "./pricing";

const STORAGE_KEY = "marasi-local-v1";

export type LocalRate = PrdRateInput & { active: boolean };
export type LocalDiscountTier = PrdDiscountTierInput & { active: boolean };
export type LocalFee = TicketFeeInput & { active: boolean };
export type LocalExpenseCategory = { id: number; name: string; code: string; active: boolean };
export type LocalCustomer = { id: number; fullName: string; phone: string; email: string; createdAt: string };
export type LocalExpense = {
  id: number; businessDate: string; categoryId: number; categoryName: string; amount: string; payee: string; description: string;
  receiptNumber: string; attachmentDataUrl: string; attachmentName: string;
};
export type LocalPurchaseLine = {
  ticketNumber: string; ticketType: PrdTicketType; freeEntryCategory: PrdFreeEntryCategory | null; rateId: number;
  label: string; code: string | null; basePrice: string; discountPercentage: string; discountAmount: string;
  vatAmount: string; feeAmount: string; totalAmount: string;
};
export type LocalPurchaseFee = { feeId: number; label: string; code: string | null; amount: string; quantity: number };
export type LocalPurchase = {
  id: number; customerId: number; visitDate: string; chargeableTicketCount: number; discountPercentage: string;
  baseSubtotal: string; discountAmount: string; vatAmount: string; feeTotal: string; totalAmount: string;
  paymentMethod: "cash" | "card" | "bank" | "mixed"; notes: string; createdAt: string;
  lines: LocalPurchaseLine[]; fees: LocalPurchaseFee[];
};

type StoreData = {
  version: 1;
  rates: LocalRate[];
  discountTiers: LocalDiscountTier[];
  fees: LocalFee[];
  expenseCategories: LocalExpenseCategory[];
  customers: LocalCustomer[];
  purchases: LocalPurchase[];
  expenses: LocalExpense[];
  nextTicketNumber: number;
  nextId: number;
};

function defaultData(): StoreData {
  return {
    version: 1,
    rates: [
      { id: 1, name: "Waterpark ticket", code: "WATERPARK", ticketType: "waterpark", unitPrice: "3.00", active: true },
      { id: 2, name: "Companion ticket", code: "COMPANION", ticketType: "companion", unitPrice: "2.00", active: true },
    ],
    discountTiers: [
      { id: 1, minTickets: 25, maxTickets: 29, percentage: "15.00", active: true },
      { id: 2, minTickets: 50, maxTickets: 99, percentage: "25.00", active: true },
      { id: 3, minTickets: 100, maxTickets: null, percentage: "50.00", active: true },
    ],
    fees: [],
    // Matches the client's actual accounting-sheet categories. Super Admin
    // can still add/remove from here afterward.
    expenseCategories: [
      { id: 1, name: "Salaries (Full Time / Part Time / Over Time / Freelance)", code: "SALARIES", active: true },
      { id: 2, name: "Utilities (Electricity / Water / Telephone / Internet)", code: "UTILITIES", active: true },
      { id: 3, name: "Maintenance", code: "MAINTENANCE", active: true },
      { id: 4, name: "COGS (Chlorine, Paint, etc.)", code: "COGS", active: true },
      { id: 5, name: "Advertising & Marketing", code: "ADVERTISING_MARKETING", active: true },
      { id: 6, name: "Office Supplies", code: "OFFICE_SUPPLIES", active: true },
      { id: 7, name: "Fixture & Furniture", code: "FIXTURE_FURNITURE", active: true },
      { id: 8, name: "Tax & VAT (Municipality 3% / Tourism 4% / VAT 5%)", code: "TAX_VAT", active: true },
      { id: 9, name: "Petty Cash (cleaning labor, ticket printing, external labor, gardening labor, cleaning tools, maintenance tools, fuel, etc.)", code: "PETTY_CASH", active: true },
      { id: 10, name: "Other Expenses", code: "OTHER_EXPENSES", active: true },
    ],
    customers: [],
    purchases: [],
    expenses: [],
    nextTicketNumber: STARTING_TICKET_NUMBER,
    // Starts above every seeded id above (rates/discountTiers/expenseCategories
    // each use small fixed ids) so a newly added record can never collide with
    // a seed record in the same array.
    nextId: 100,
  };
}

function loadData(): StoreData {
  if (typeof window === "undefined") return defaultData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return defaultData();
    return { ...defaultData(), ...parsed };
  } catch {
    return defaultData();
  }
}

let data = loadData();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* storage unavailable (private mode, quota) — state still works for this tab */ }
  }
  listeners.forEach((listener) => listener());
}

function nextId() {
  const id = data.nextId;
  data = { ...data, nextId: id + 1 };
  return id;
}

export function resetStore() {
  data = defaultData();
  persist();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return data;
}

// Returns the whole store snapshot, a stable reference that only changes
// when a mutator above reassigns `data`. Derive filtered/computed values
// with useMemo in the component instead of selecting here — a selector that
// returns a fresh array/object every call would break useSyncExternalStore's
// "cached snapshot" contract and can trigger an infinite render loop.
export function useLocalStore(): StoreData {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// ─── Rates ──────────────────────────────────────────────────────────────────
export function addRate(input: { name: string; code: string; ticketType: PrdTicketType; unitPrice: string }) {
  const rate: LocalRate = { id: nextId(), name: input.name, code: input.code, ticketType: input.ticketType, unitPrice: input.unitPrice, active: true };
  data = { ...data, rates: [...data.rates, rate] };
  persist();
  return rate;
}
export function updateRate(id: number, patch: Partial<Omit<LocalRate, "id">>) {
  data = { ...data, rates: data.rates.map((rate) => (rate.id === id ? { ...rate, ...patch } : rate)) };
  persist();
}
export function removeRate(id: number) {
  data = { ...data, rates: data.rates.map((rate) => (rate.id === id ? { ...rate, active: false } : rate)) };
  persist();
}

// ─── Discount tiers ─────────────────────────────────────────────────────────
export function addDiscountTier(input: { minTickets: number; maxTickets: number | null; percentage: string }) {
  const tier: LocalDiscountTier = { id: nextId(), ...input, active: true };
  data = { ...data, discountTiers: [...data.discountTiers, tier] };
  persist();
  return tier;
}
export function updateDiscountTier(id: number, patch: Partial<Omit<LocalDiscountTier, "id">>) {
  data = { ...data, discountTiers: data.discountTiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)) };
  persist();
}
export function removeDiscountTier(id: number) {
  data = { ...data, discountTiers: data.discountTiers.map((tier) => (tier.id === id ? { ...tier, active: false } : tier)) };
  persist();
}

// ─── Fees ───────────────────────────────────────────────────────────────────
export function addFee(input: { name: string; code: string; calculationType: "fixed" | "percentage"; value: string; applicationBasis: "per_ticket" | "per_transaction"; displayOrder: number }) {
  const fee: LocalFee = { id: nextId(), ...input, active: true };
  data = { ...data, fees: [...data.fees, fee] };
  persist();
  return fee;
}
export function updateFee(id: number, patch: Partial<Omit<LocalFee, "id">>) {
  data = { ...data, fees: data.fees.map((fee) => (fee.id === id ? { ...fee, ...patch } : fee)) };
  persist();
}
export function removeFee(id: number) {
  data = { ...data, fees: data.fees.map((fee) => (fee.id === id ? { ...fee, active: false } : fee)) };
  persist();
}

// ─── Expense categories ─────────────────────────────────────────────────────
export function addExpenseCategory(input: { name: string; code: string }) {
  const category: LocalExpenseCategory = { id: nextId(), name: input.name, code: input.code, active: true };
  data = { ...data, expenseCategories: [...data.expenseCategories, category] };
  persist();
  return category;
}
export function updateExpenseCategory(id: number, patch: Partial<Omit<LocalExpenseCategory, "id">>) {
  data = { ...data, expenseCategories: data.expenseCategories.map((category) => (category.id === id ? { ...category, ...patch } : category)) };
  persist();
}
export function removeExpenseCategory(id: number) {
  data = { ...data, expenseCategories: data.expenseCategories.map((category) => (category.id === id ? { ...category, active: false } : category)) };
  persist();
}

// ─── Customers ──────────────────────────────────────────────────────────────
export function findOrCreateCustomer(input: { customerId?: number; fullName?: string; phone?: string; email?: string }) {
  if (input.customerId) {
    const existing = data.customers.find((customer) => customer.id === input.customerId);
    if (existing) return existing;
  }
  const customer: LocalCustomer = {
    id: nextId(), fullName: (input.fullName || "").trim(), phone: (input.phone || "").trim(),
    email: (input.email || "").trim(), createdAt: new Date().toISOString(),
  };
  data = { ...data, customers: [...data.customers, customer] };
  persist();
  return customer;
}

// ─── Expenses ───────────────────────────────────────────────────────────────
export function addExpense(input: {
  businessDate: string; categoryId: number; amount: string; payee?: string; description: string;
  receiptNumber?: string; attachmentDataUrl?: string; attachmentName?: string;
}) {
  const category = data.expenseCategories.find((entry) => entry.id === input.categoryId);
  if (!category?.active) throw new Error("Choose an active expense category");
  const expense: LocalExpense = {
    id: nextId(), businessDate: input.businessDate, categoryId: input.categoryId, categoryName: category.name,
    amount: input.amount, payee: input.payee || "", description: input.description,
    receiptNumber: input.receiptNumber || "", attachmentDataUrl: input.attachmentDataUrl || "", attachmentName: input.attachmentName || "",
  };
  data = { ...data, expenses: [...data.expenses, expense] };
  persist();
  return expense;
}
export function removeExpense(id: number) {
  data = { ...data, expenses: data.expenses.filter((expense) => expense.id !== id) };
  persist();
}

// ─── Ticket purchases ───────────────────────────────────────────────────────
export type PurchaseLineDraft = { rateId: number; ticketType: PrdTicketType; freeEntryCategory: PrdFreeEntryCategory | null };

export function previewPurchase(lines: PurchaseLineDraft[]) {
  const resolvedLines = lines
    .map((line) => ({ line, rate: data.rates.find((rate) => rate.id === line.rateId && rate.active) }))
    .filter((entry): entry is { line: PurchaseLineDraft; rate: LocalRate } => Boolean(entry.rate));
  if (!resolvedLines.length) return null;
  return calculatePrdPurchasePricing({
    lines: resolvedLines.map(({ line, rate }) => ({ rate, ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory })),
    discountTiers: data.discountTiers.filter((tier) => tier.active),
    fees: data.fees.filter((fee) => fee.active),
  });
}

export function issuePurchase(input: {
  customerId?: number; customerName?: string; customerPhone?: string; customerEmail?: string; visitDate: string;
  lines: PurchaseLineDraft[]; paymentMethod: "cash" | "card" | "bank" | "mixed"; notes?: string;
}) {
  if (!input.customerId && !(input.customerName?.trim() && input.customerPhone?.trim())) throw new Error("Select a customer or add a name and phone");
  const pricing = previewPurchase(input.lines);
  if (!pricing) throw new Error("Select a ticket type and approved price for every line");
  const customer = findOrCreateCustomer({ customerId: input.customerId, fullName: input.customerName, phone: input.customerPhone, email: input.customerEmail });
  const startNumber = data.nextTicketNumber;
  const lines: LocalPurchaseLine[] = pricing.lines.map((line, index) => ({
    ticketNumber: formatLocalTicketNumber(startNumber + index), ticketType: line.ticketType, freeEntryCategory: line.freeEntryCategory,
    rateId: line.rateId, label: line.label, code: line.code, basePrice: line.basePrice, discountPercentage: line.discountPercentage,
    discountAmount: line.discountAmount, vatAmount: line.vatAmount, feeAmount: line.feeAmount, totalAmount: line.totalAmount,
  }));
  const purchase: LocalPurchase = {
    id: nextId(), customerId: customer.id, visitDate: input.visitDate, chargeableTicketCount: pricing.chargeableTicketCount,
    discountPercentage: pricing.discountPercentage, baseSubtotal: pricing.baseSubtotal, discountAmount: pricing.discountAmount,
    vatAmount: pricing.vatAmount, feeTotal: pricing.feeTotal, totalAmount: pricing.totalAmount, paymentMethod: input.paymentMethod,
    notes: input.notes || "", createdAt: new Date().toISOString(), lines,
    fees: pricing.fees.map((fee) => ({ feeId: fee.feeId, label: fee.label, code: fee.code, amount: fee.amount, quantity: fee.quantity })),
  };
  data = { ...data, purchases: [...data.purchases, purchase], nextTicketNumber: startNumber + lines.length };
  persist();
  return { purchase, customer, pricing };
}

// ─── Backup ─────────────────────────────────────────────────────────────────
export function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `marasi-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function importData(json: string) {
  const parsed = JSON.parse(json);
  if (parsed?.version !== 1) throw new Error("This file is not a Marasi local backup");
  data = { ...defaultData(), ...parsed };
  persist();
}

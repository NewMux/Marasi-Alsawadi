export const money = (value: unknown) => `OMR ${Number(value || 0).toLocaleString("en-OM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const dateLabel = (value: unknown) => (value ? new Date(value as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const today = () => new Date().toISOString().slice(0, 10);

/** Pill colour class for a proposal or invoice status. Unknown statuses stay neutral. */
export function pillClass(status: string | undefined, overdue = false): string {
  if (overdue) return "pill bad";
  switch ((status ?? "").toLowerCase()) {
    case "paid":
    case "accepted":
      return "pill ok";
    case "sent":
    case "viewed":
      return "pill info";
    case "declined":
    case "void":
      return "pill bad";
    case "partial":
    case "pending":
      return "pill warn";
    default:
      return "pill";
  }
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

export const money = (n: number | null | undefined, currency = "USD") =>
  n == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

/** Status words read as labels: "partially_paid" → "Partially paid". */
export const statusLabel = (status: string | undefined) => {
  const s = (status ?? "unknown").replace(/_/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : "Unknown";
};

/** US numbers in E.164 read as (415) 555-0107; anything else is shown as stored. */
export const phoneLabel = (phone: string | null | undefined) => {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone ?? "");
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone ?? "";
};

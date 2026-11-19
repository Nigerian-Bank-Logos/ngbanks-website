export type Bank = {
  name: string;
  aliases: string[];
  bankCode: string | null;
  scCode: string | null;
  category: string;
  logos: { png: string; svg: string };
};

export type BanksResponse = {
  banks: Bank[];
  metadata?: { total_banks: number; last_updated: string };
};

/** Menu order + labels. `plural` is used in the sidebar, `singular` on the card pill. */
export const CATEGORIES: { id: string; plural: string; singular: string }[] = [
  { id: 'commercial_banks', plural: 'Commercial banks', singular: 'Commercial bank' },
  { id: 'microfinance_banks', plural: 'Microfinance banks', singular: 'Microfinance bank' },
  { id: 'mobile_money', plural: 'Mobile money banks', singular: 'Mobile money' },
  { id: 'mortgage_banks', plural: 'Mortgage banks', singular: 'Mortgage bank' },
  { id: 'finance_companies', plural: 'Finance companies', singular: 'Finance company' },
  { id: 'payment_service_banks', plural: 'Payment service banks', singular: 'Payment service bank' },
  { id: 'merchant_banks', plural: 'Merchant banks', singular: 'Merchant bank' },
];

const humanize = (id: string) => {
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function categoryLabel(id: string, form: 'plural' | 'singular' = 'plural'): string {
  return CATEGORIES.find((c) => c.id === id)?.[form] ?? humanize(id);
}

/** Matches name, any alias, bank code or short code. `q` must already be trimmed + lowercased. */
export function matchesQuery(bank: Bank, q: string): boolean {
  if (!q) return true;
  return (
    bank.name.toLowerCase().includes(q) ||
    bank.aliases.some((a) => a.toLowerCase().includes(q)) ||
    (bank.bankCode ?? '').includes(q) ||
    (bank.scCode ?? '').includes(q)
  );
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

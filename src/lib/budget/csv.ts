/**
 * CSV import/export, matching the column set Cashew reads and writes.
 *
 * Import is deliberately forgiving: it accepts Cashew's own header names plus
 * the common variants a bank export uses, because the alternative is a user
 * hand-editing a header row before every import.
 */

import { createCategory, createTransaction, newId } from "./factory";
import { toDateInputValue } from "./period";
import type { AllWallets } from "./currency";
import type { Transaction, TransactionCategory, TransactionWallet } from "./types";
import { MethodAdded } from "./types";

const COLUMNS = [
  "Date",
  "Amount",
  "Category",
  "Subcategory",
  "Title",
  "Note",
  "Account",
  "Currency",
  "Income",
  "Paid",
] as const;

function escapeCell(value: string): string {
  // Quote when the value contains a delimiter, quote or newline; double any
  // embedded quotes, per RFC 4180.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function exportTransactionsCsv(
  transactions: Transaction[],
  ctx: {
    categories: TransactionCategory[];
    wallets: TransactionWallet[];
    allWallets: AllWallets;
  },
): string {
  const categoryByPk = new Map(ctx.categories.map((c) => [c.categoryPk, c]));
  const walletByPk = new Map(ctx.wallets.map((w) => [w.walletPk, w]));

  const rows = [...transactions]
    .sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime())
    .map((t) => {
      const wallet = walletByPk.get(t.walletFk);
      return [
        toDateInputValue(new Date(t.dateCreated)),
        String(t.amount),
        categoryByPk.get(t.categoryFk)?.name ?? "",
        t.subCategoryFk ? (categoryByPk.get(t.subCategoryFk)?.name ?? "") : "",
        t.name,
        t.note,
        wallet?.name ?? "",
        wallet?.currency ?? "",
        t.income ? "true" : "false",
        t.paid ? "true" : "false",
      ]
        .map(escapeCell)
        .join(",");
    });

  return [COLUMNS.join(","), ...rows].join("\n");
}

/** Split one CSV line, honouring quoted fields. */
function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

/** Header aliases accepted on import, normalised to lowercase. */
const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  "transaction date": "date",
  when: "date",
  amount: "amount",
  value: "amount",
  category: "category",
  subcategory: "subcategory",
  "sub category": "subcategory",
  title: "title",
  name: "title",
  description: "title",
  note: "note",
  notes: "note",
  memo: "note",
  account: "account",
  wallet: "account",
  currency: "currency",
  income: "income",
  paid: "paid",
};

export interface CsvImportResult {
  transactions: Transaction[];
  /** New categories the import had to invent, ready to be persisted. */
  categories: TransactionCategory[];
  skipped: number;
}

/**
 * Parse a CSV into transactions.
 *
 * Rows without a usable date or amount are skipped rather than guessed at.
 * Categories are matched by name and created when absent, so an import never
 * silently dumps everything into one bucket.
 */
export function importTransactionsCsv(
  text: string,
  ctx: {
    categories: TransactionCategory[];
    wallets: TransactionWallet[];
    defaultWalletPk: string;
  },
): CsvImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return { transactions: [], categories: [], skipped: 0 };

  const header = parseLine(lines[0]).map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? "");
  const index = (key: string) => header.indexOf(key);

  const dateAt = index("date");
  const amountAt = index("amount");
  if (dateAt === -1 || amountAt === -1) {
    return { transactions: [], categories: [], skipped: lines.length - 1 };
  }

  const categoryAt = index("category");
  const subCategoryAt = index("subcategory");
  const titleAt = index("title");
  const noteAt = index("note");
  const accountAt = index("account");
  const incomeAt = index("income");
  const paidAt = index("paid");

  const categoriesByName = new Map(
    ctx.categories.map((c) => [c.name.trim().toLowerCase(), c] as const),
  );
  const walletsByName = new Map(
    ctx.wallets.map((w) => [w.name.trim().toLowerCase(), w] as const),
  );

  const newCategories: TransactionCategory[] = [];
  const transactions: Transaction[] = [];
  let skipped = 0;

  const resolveCategory = (name: string, income: boolean): string => {
    const key = name.trim().toLowerCase();
    const existing = categoriesByName.get(key);
    if (existing) return existing.categoryPk;

    const created = createCategory({
      name: name.trim() || "Imported",
      income,
      methodAdded: MethodAdded.csv,
      order: ctx.categories.length + newCategories.length,
    });
    newCategories.push(created);
    categoriesByName.set(key, created);
    return created.categoryPk;
  };

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const rawDate = cells[dateAt]?.trim();
    const rawAmount = cells[amountAt]?.trim().replace(/[^0-9.\-+]/g, "");

    const date = rawDate ? new Date(rawDate) : null;
    const amount = rawAmount ? Number(rawAmount) : NaN;
    if (!date || Number.isNaN(date.getTime()) || !Number.isFinite(amount)) {
      skipped++;
      continue;
    }

    // Direction comes from an explicit column when present, otherwise from the
    // sign — which is how a bank export encodes it.
    const explicitIncome = incomeAt !== -1 ? /^(true|yes|1|income)$/i.test(cells[incomeAt] ?? "") : null;
    const income = explicitIncome ?? amount > 0;
    const signedAmount = income ? Math.abs(amount) : -Math.abs(amount);

    const categoryName = categoryAt !== -1 ? (cells[categoryAt] ?? "") : "";
    const categoryFk = resolveCategory(categoryName || "Imported", income);

    const subCategoryName = subCategoryAt !== -1 ? cells[subCategoryAt]?.trim() : "";
    const subCategoryFk = subCategoryName ? resolveCategory(subCategoryName, income) : null;

    const accountName = accountAt !== -1 ? cells[accountAt]?.trim().toLowerCase() : "";
    const wallet = accountName ? walletsByName.get(accountName) : undefined;

    transactions.push(
      createTransaction({
        transactionPk: newId(),
        name: titleAt !== -1 ? (cells[titleAt]?.trim() ?? "") : "",
        note: noteAt !== -1 ? (cells[noteAt]?.trim() ?? "") : "",
        amount: signedAmount,
        income,
        categoryFk,
        subCategoryFk,
        walletFk: wallet?.walletPk ?? ctx.defaultWalletPk,
        dateCreated: date.toISOString(),
        paid: paidAt !== -1 ? !/^(false|no|0)$/i.test(cells[paidAt] ?? "") : true,
        methodAdded: MethodAdded.csv,
      }),
    );
  }

  return { transactions, categories: newCategories, skipped };
}

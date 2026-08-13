"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Accounts (Cashew's "wallets"): balances, currency, and the primary account
 * that every cross-currency total is normalised into.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Pencil, PiggyBank, Star, Trash, Wallet, CaretLeft, CaretRight, DotsThreeVertical, ArrowRight, Plus } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { AccountType, type TransactionWallet } from "@/lib/budget/types";
import { getCreditCardStatus, isCreditCard, getTotalCreditOutstanding } from "@/lib/budget/credit";
import { getNetWorth, getWalletBalance } from "@/lib/budget/calculations";
import { CURRENCIES, getCurrencyInfo, formatCurrencyAmount } from "@/lib/budget/currency";
import { createBalanceCorrection } from "@/lib/budget/recurring";
import { atMidday, fromDateInputValue, toDateInputValue } from "@/lib/budget/period";
import { createWallet, newId } from "@/lib/budget/factory";
import { ColourPicker, IconBadge, IconPicker } from "./icon-picker";
import { useBudget, usePolicySavings } from "./budget-provider";
import {
  AddFab,
  Amount,
  Card,
  ConfirmButton,
  EmptyState,
  Field,
  PrimaryButton,
  ProgressBar,
  SelectInput,
  Sheet,
  TextInput,
  Toggle,
} from "./budget-ui";

export function AccountsView() {
  const { wallets, transactions, allWallets, settings, updateSettings  } = useBudget(useShallow((s) => ({ wallets: s.wallets, transactions: s.transactions, allWallets: s.allWallets, settings: s.settings, updateSettings: s.updateSettings })));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWallet | null>(null);
  const [openMenuWalletPk, setOpenMenuWalletPk] = useState<string | null>(null);

  const savings = usePolicySavings();
  const netWorth = useMemo(
    () => getNetWorth(allWallets, transactions, savings.netWorthContribution),
    [allWallets, transactions, savings.netWorthContribution],
  );

  const creditOutstanding = useMemo(
    () => getTotalCreditOutstanding(allWallets, transactions),
    [allWallets, transactions],
  );

  const sorted = [...wallets]
    .sort((a, b) => a.order - b.order)
    .filter((w) => !(settings.homePageHidden ?? []).includes(w.walletPk));

  return (
    <>
      <div className={cn("mb-4 grid gap-3", creditOutstanding > 0 ? "grid-cols-2" : "grid-cols-1")}>
        <Card className="text-center !py-4 px-3 flex flex-col justify-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50 font-medium">Net worth</p>
          <Amount value={netWorth} className="text-title2 sm:text-title1 font-bold" colour />
          <p className="mt-0.5 text-[11px] text-label-secondary/50 truncate">
            Across {wallets.length} account{wallets.length === 1 ? "" : "s"}
          </p>
        </Card>

        {creditOutstanding > 0 ? (
          <Card className="text-center !py-4 px-3 flex flex-col justify-center">
            <p className="text-caption uppercase tracking-wide text-label-secondary/50 font-medium">
              Credit card dues
            </p>
            <Amount value={creditOutstanding} className="text-title2 sm:text-title1 font-bold text-red" />
            <p className="mt-0.5 text-[11px] text-label-secondary/50 truncate">
              Deducted from net worth
            </p>
          </Card>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={Wallet} title="No accounts found" />
      ) : (
        <div className="space-y-8">
          {[
            {
              title: "Credit Cards",
              wallets: sorted.filter((w) => isCreditCard(w)),
              type: "credit",
            },
            {
              title: "Bank Accounts",
              wallets: sorted.filter((w) => !isCreditCard(w) && (w.accountType ?? AccountType.bank) === AccountType.bank),
              type: "bank",
            },
            {
              title: "Cash & Wallets",
              wallets: sorted.filter((w) => {
                const type = w.accountType ?? AccountType.bank;
                return type === AccountType.cash || type === AccountType.wallet;
              }),
              type: "cash",
            },
            {
              title: "Investments & Other",
              wallets: sorted.filter((w) => {
                const type = w.accountType ?? AccountType.bank;
                return type === AccountType.investment;
              }),
              type: "investment",
            },
          ].filter((g) => g.wallets.length > 0).map((group) => (
            <div key={group.type}>
              <h2 className="mb-3 px-1 text-footnote font-semibold uppercase tracking-wider text-label-secondary/60">
                {group.title}
              </h2>

              <div
                className={cn(
                  "grid gap-4",
                  group.type === "credit" ? "md:grid-cols-2" : "",
                  group.type === "bank" ? "md:grid-cols-2 lg:grid-cols-3" : "",
                  (group.type === "cash" || group.type === "investment") ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3" : "",
                )}
              >
                {group.wallets.map((wallet) => {
                  const balance = getWalletBalance(transactions, wallet.walletPk);
                  const isPrimary = wallet.walletPk === settings.primaryWalletPk;
                  const card = group.type === "credit" ? getCreditCardStatus(wallet, transactions) : null;
                  const canDelete = wallets.length > 1 && !isPrimary;
                  const accentColour = wallet.colour ?? "#8E8E93";

                  return (
                    <div
                      key={wallet.walletPk}
                      className={cn(
                        "group relative flex items-center justify-between rounded-[16px] bg-bg-elevated px-3.5 py-3 text-label transition-all duration-200 border border-separator/20 hover:border-separator/50 shadow-2xs hover:shadow-xs active:scale-[0.995]",
                        openMenuWalletPk === wallet.walletPk ? "z-30 ring-1 ring-separator/40" : "z-0"
                      )}
                    >
                      <Link href={`/budget/accounts/${wallet.walletPk}`} className="flex flex-1 items-center justify-between gap-3 min-w-0 pr-2">
                        {/* Left: Avatar + Title & Subtitle */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fill/10 dark:bg-white/10">
                            <IconBadge iconName={wallet.iconName} colour={accentColour} size={20} fallback={wallet.name} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-subhead font-bold text-label tracking-tight">{wallet.name}</span>
                              {isPrimary ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber/15 px-1.5 py-0.2 text-[9px] font-bold text-amber">
                                  <Star size={9} className="fill-amber text-amber" />
                                  Primary
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 text-caption2 text-label-secondary/60 font-medium">
                              <span>
                                {card
                                  ? `${formatCurrencyAmount(card.available ?? 0, wallet.currency, { decimals: 0, compact: true })} avail.`
                                  : getCurrencyInfo(wallet.currency)?.name ?? wallet.currency?.toUpperCase()}
                              </span>
                              {card?.nextDueDate ? (
                                <span className={cn("truncate font-semibold", (card.daysUntilDue ?? 99) <= 3 && card.outstanding > 0 ? "text-red" : "text-label-secondary/70")}>
                                  · Due {card.nextDueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Right: Balance & Micro Progress Bar */}
                        <div className="shrink-0 text-right">
                          <span
                            className={cn(
                              "block text-subhead font-black tracking-tight tabular-nums text-label",
                              card ? (card.outstanding > 0 ? "text-red" : "text-green") : balance < 0 ? "text-red" : "text-label",
                              settings.hideAmounts && "font-mono tracking-widest text-label-secondary/50"
                            )}
                          >
                            {formatCurrencyAmount(card ? card.outstanding : balance, wallet.currency, {
                              decimals: settings.showDecimals ? wallet.decimals : 0,
                              obfuscate: settings.hideAmounts
                            })}
                          </span>
                          {card && card.utilisation !== null ? (
                            <div className="mt-1 flex items-center justify-end gap-1.5">
                              <div className="h-1 w-12 overflow-hidden rounded-full bg-fill/20">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, card.utilisation * 100))}%`,
                                    backgroundColor: card.highUtilisation ? "rgb(var(--sys-orange))" : accentColour,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-label-secondary/50">{Math.round(card.utilisation * 100)}%</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-label-secondary/50">
                              balance
                            </span>
                          )}
                        </div>
                      </Link>

                      {/* 3-Dot Actions Menu Button & Dropdown */}
                      <div className="relative shrink-0 border-l border-separator/15 pl-1.5">
                        <button
                          type="button"
                          aria-label={`Options for ${wallet.name}`}
                          onClick={() => setOpenMenuWalletPk(openMenuWalletPk === wallet.walletPk ? null : wallet.walletPk)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-label-secondary/60 transition-colors hover:bg-fill/15 hover:text-label active:scale-95"
                        >
                          <DotsThreeVertical size={18} weight="bold" />
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuWalletPk === wallet.walletPk ? (
                          <>
                            {/* Backdrop overlay to close menu on outside click */}
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setOpenMenuWalletPk(null)}
                            />

                            <div className="absolute right-0 top-9 z-50 min-w-[140px] overflow-hidden rounded-xl border border-separator/30 bg-bg-elevated p-1 shadow-lg ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                              {!isPrimary ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    updateSettings({ primaryWalletPk: wallet.walletPk });
                                    setOpenMenuWalletPk(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-caption font-medium text-label hover:bg-fill/15 transition-colors"
                                >
                                  <Star size={14} className="text-amber" />
                                  <span>Set as primary</span>
                                </button>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(wallet);
                                  setEditorOpen(true);
                                  setOpenMenuWalletPk(null);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-caption font-medium text-label hover:bg-fill/15 transition-colors"
                              >
                                <Pencil size={14} />
                                <span>Edit account</span>
                              </button>

                              {canDelete ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditing(wallet);
                                    setEditorOpen(true);
                                    setOpenMenuWalletPk(null);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-caption font-medium text-red hover:bg-red/10 transition-colors"
                                >
                                  <Trash size={14} />
                                  <span>Delete account</span>
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 px-1 text-caption text-label-secondary/50">
        Every transaction belongs to an account, which represents where your money is stored or
        spent. The primary account&apos;s currency is used for all combined totals.
      </p>

      <AddFab
        onClick={() => {
          setEditing(null);
          setEditorOpen(true);
        }}
        label="Add account"
      />
      <AccountEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
    </>
  );
}

function AccountEditor({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: TransactionWallet | null;
}) {
  const { wallets,
    transactions,
    settings,
    upsertWallet,
    deleteWallet,
    upsertTransaction,
    updateSettings,
   } = useBudget(useShallow((s) => ({ wallets: s.wallets, transactions: s.transactions, settings: s.settings, upsertWallet: s.upsertWallet, deleteWallet: s.deleteWallet, upsertTransaction: s.upsertTransaction, updateSettings: s.updateSettings })));

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("inr");
  const [decimals, setDecimals] = useState("2");
  const [newBalance, setNewBalance] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [openingDate, setOpeningDate] = useState(() => toDateInputValue(new Date()));
  const [moveTo, setMoveTo] = useState("");
  const [accountType, setAccountType] = useState(String(AccountType.bank));
  const [creditLimit, setCreditLimit] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [iconName, setIconName] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(false);

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = editing?.walletPk ?? "new";
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    if (editing) {
      setName(editing.name);
      setCurrency(editing.currency ?? "inr");
      setDecimals(String(editing.decimals));
      setNewBalance("");
      setMoveTo("");
      setAccountType(String(editing.accountType ?? AccountType.bank));
      setCreditLimit(editing.creditLimit === null ? "" : String(editing.creditLimit));
      setStatementDay(editing.statementDay === null ? "" : String(editing.statementDay));
      setDueDay(editing.dueDay === null ? "" : String(editing.dueDay));
      setIconName(editing.iconName);
      setColour(editing.colour);
      setExcludeFromNetWorth(editing.excludeFromNetWorth ?? false);
    } else {
      setName("");
      setCurrency(settings.primaryWalletPk ? "inr" : "inr");
      setDecimals("2");
      setNewBalance("");
      setMoveTo("");
      setOpeningBalance("");
      setOpeningDate(toDateInputValue(new Date()));
      setAccountType(String(AccountType.bank));
      setCreditLimit("");
      setStatementDay("");
      setDueDay("");
      setIconName(null);
      setColour(null);
      setExcludeFromNetWorth(false);
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const currentBalance = editing ? getWalletBalance(transactions, editing.walletPk) : 0;
  const isCard = Number(accountType) === AccountType.creditCard;

  function handleSave() {
    const base = editing ?? createWallet();
    upsertWallet({
      ...base,
      name: name.trim() || "Account",
      currency,
      decimals: Number(decimals) || 0,
      order: editing?.order ?? wallets.length,
      accountType: Number(accountType) as AccountType,
      iconName,
      colour,
      // Card-only fields are cleared when the type changes, so a bank account
      // never carries a stale limit that would show a bogus utilisation.
      creditLimit: isCard && creditLimit !== "" ? Number(creditLimit) : null,
      statementDay: isCard && statementDay !== "" ? Number(statementDay) : null,
      dueDay: isCard && dueDay !== "" ? Number(dueDay) : null,
      excludeFromNetWorth,
    });

    // A new account's opening balance is written as a correction transaction
    // rather than stored on the account, so the balance stays a pure sum of its
    // transactions — the same invariant every other total relies on.
    if (!editing && openingBalance !== "" && Number(openingBalance) !== 0) {
      // On a card the figure entered is what you *owe*, and debt is a negative
      // balance — entering 5,000 outstanding must not read as 5,000 in assets.
      const magnitude = Math.abs(Number(openingBalance));
      upsertTransaction(
        createBalanceCorrection({
          walletPk: base.walletPk,
          currentBalance: 0,
          newBalance: isCard ? -magnitude : Number(openingBalance),
          // Midday local, like every other dated row, so a timezone shift
          // cannot tip it into the neighbouring day or budget period.
          date: openingDate ? atMidday(fromDateInputValue(openingDate)) : new Date(),
          newPk: newId,
          name: isCard ? "Opening balance owed" : "Opening balance",
        }),
      );
    }

    // Setting a balance writes a correction transaction rather than mutating
    // history — the same way Cashew reconciles an account.
    if (editing && newBalance !== "" && Number(newBalance) !== currentBalance) {
      upsertTransaction(
        createBalanceCorrection({
          walletPk: editing.walletPk,
          currentBalance,
          newBalance: Number(newBalance),
          date: new Date(),
          newPk: newId,
        }),
      );
    }
    onClose();
  }

  const isPrimary = editing?.walletPk === settings.primaryWalletPk;
  const canDelete = editing && wallets.length > 1 && !isPrimary;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit Account" : "Add Account"}
      footer={
        <div className="space-y-2">
          <PrimaryButton onClick={handleSave} disabled={!name.trim()}>
            {editing ? "Save Changes" : "Create Account"}
          </PrimaryButton>
          {canDelete ? (
            <ConfirmButton
              idleLabel="Delete Account"
              confirmLabel={
                moveTo ? "Tap again to move & delete" : "Tap again — deletes its transactions"
              }
              onConfirm={() => {
                deleteWallet(editing.walletPk, moveTo || undefined);
                onClose();
              }}
            />
          ) : null}
        </div>
      }
    >
      <Field label="Account type">
        <SelectInput value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          <option value={AccountType.bank}>Bank account</option>
          <option value={AccountType.cash}>Cash</option>
          <option value={AccountType.creditCard}>Credit card</option>
          <option value={AccountType.wallet}>Wallet / UPI</option>
          <option value={AccountType.investment}>Investment</option>
        </SelectInput>
      </Field>

      <Field label="Name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isCard ? "HDFC Regalia" : "Bank"}
        />
      </Field>

      <IconPicker value={iconName} colour={colour} onChange={setIconName} />
      <ColourPicker value={colour} onChange={setColour} />

      {isCard ? (
        <>
          <Field
            label="Credit limit"
            hint="Used for the available-credit and utilisation figures."
          >
            <TextInput
              type="number"
              inputMode="decimal"
              min="0"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Statement day" hint="Day the bill is generated.">
              <TextInput
                type="number"
                min="1"
                max="28"
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
                placeholder="1–28"
              />
            </Field>
            <Field label="Payment due day">
              <TextInput
                type="number"
                min="1"
                max="28"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="1–28"
              />
            </Field>
          </div>
          <p className="mb-3 rounded-ios bg-fill/10 px-3 py-2 text-caption text-label-secondary/70">
            Spend on the card as normal — the balance goes negative, which is what you owe. Pay the
            bill with a Transfer from your bank to this card.
          </p>
        </>
      ) : null}

      <div className="py-2">
        <Toggle
          checked={excludeFromNetWorth}
          onChange={setExcludeFromNetWorth}
          label="Exclude from Net Worth"
        />
      </div>

      <Field
        label="Currency"
        hint={isPrimary ? "This is the primary account — its currency is used for all totals." : undefined}
      >
        <SelectInput value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.name} ({c.code.toUpperCase()})
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field label="Decimal places" hint="Set 0 for currencies without minor units.">
        <SelectInput value={decimals} onChange={(e) => setDecimals(e.target.value)}>
          {[0, 1, 2, 3, 4, 8].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectInput>
      </Field>

      {!editing ? (
        <Field
          label={isCard ? "Current outstanding" : "Opening balance"}
          hint={
            isCard
              ? "What you currently owe on this card. Leave blank if it is clear."
              : "What is in this account right now. Leave blank to start from zero."
          }
        >
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.01"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            placeholder="0.00"
          />
        </Field>
      ) : null}

      {!editing && openingBalance !== "" && Number(openingBalance) !== 0 ? (
        <Field
          label="Opening date"
          hint="When this balance was true. Earlier transactions you add later will sit before it."
        >
          <TextInput
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
          />
        </Field>
      ) : null}

      {editing ? (
        <>
          <Field
            label="Set balance"
            hint={`Currently ${formatCurrencyAmount(currentBalance, currency)}. Saving a different value adds a balance-correction transaction.`}
          >
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              placeholder={String(currentBalance)}
            />
          </Field>

          {canDelete ? (
            <Field
              label="On delete, move transactions to"
              hint="Leave as 'Delete them' to remove this account's transactions with it."
            >
              <SelectInput value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Delete them</option>
                {wallets
                  .filter((w) => w.walletPk !== editing.walletPk)
                  .map((w) => (
                    <option key={w.walletPk} value={w.walletPk}>
                      {w.name}
                    </option>
                  ))}
              </SelectInput>
            </Field>
          ) : null}

          {!isPrimary ? (
            <button
              type="button"
              onClick={() => {
                updateSettings({ primaryWalletPk: editing.walletPk });
                onClose();
              }}
              className="mb-2 w-full rounded-ios bg-fill/10 py-2.5 text-subhead font-medium text-label-secondary"
            >
              Set as primary account
            </button>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

/** Account balances strip for the home screen. */
/** Distinct from any account colour, so savings reads as its own kind of thing. */
const SAVINGS_COLOUR = "#7E57C2";

export function AccountsSummary() {
  const { wallets, transactions, settings, allWallets, exportDatabase, replaceDatabase  } = useBudget(useShallow((s) => ({ wallets: s.wallets, transactions: s.transactions, settings: s.settings, allWallets: s.allWallets, exportDatabase: s.exportDatabase, replaceDatabase: s.replaceDatabase })));
  const savings = usePolicySavings();
  const router = useRouter();
  const sorted = [...wallets].sort((a, b) => a.order - b.order);

  function moveWallet(wallet: TransactionWallet, dir: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const currentIndex = sorted.findIndex((w) => w.walletPk === wallet.walletPk);
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + dir;
    if (nextIndex < 0 || nextIndex >= sorted.length) return;

    const newSorted = [...sorted];
    const temp = newSorted[currentIndex];
    newSorted[currentIndex] = newSorted[nextIndex];
    newSorted[nextIndex] = temp;

    const db = exportDatabase();
    db.wallets = db.wallets.map((w) => {
      const idx = newSorted.findIndex((sw) => sw.walletPk === w.walletPk);
      if (idx >= 0) return { ...w, order: idx };
      return w;
    });
    replaceDatabase(db);
  }

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar py-1 px-0.5">
      {sorted.map((wallet, index) => {
        const rawBalance = getWalletBalance(transactions, wallet.walletPk);
        const card = isCreditCard(wallet) ? getCreditCardStatus(wallet, transactions) : null;
        
        // For credit cards, only show the billed statement balance (remaining to be paid)
        // rather than the total outstanding which includes unbilled current cycle spend.
        const balance = card ? -card.remainingStatementBalance : rawBalance;
        const accentColour = wallet.colour ?? "#8E8E93";
        return (
          <div
            key={wallet.walletPk}
            onClick={() => router.push(`/budget/accounts/${wallet.walletPk}`)}
            className="group relative min-w-[144px] shrink-0 rounded-[18px] bg-bg-secondary p-4 shadow-sm transition-all hover:-translate-y-0.5 active:scale-[0.96] cursor-pointer"
            style={{ border: `1px solid ${accentColour}60` }}
          >
            <div className="relative z-10 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-caption font-medium text-label-secondary/80">{wallet.name}</p>
              </div>
              <div
                className={cn(
                  "text-title3 font-bold tracking-tight tabular-nums",
                  balance < 0 ? "text-red" : "text-label",
                  settings.hideAmounts && "font-mono tracking-widest text-label-secondary/50",
                )}
              >
                <Amount value={balance} currency={wallet.currency} />
              </div>
            </div>
          </div>
        );
      })}

      {/*
        Savings is not an account — it is what policies have accumulated, shown
        beside the accounts because that is the only place the money is visible
        at all once premiums are excluded from spending.
      */}
      {savings.visible && savings.total > 0 ? (
        <div
          onClick={() => router.push("/budget/policies")}
          className="group relative min-w-[144px] shrink-0 cursor-pointer rounded-[18px] bg-bg-secondary p-4 shadow-sm transition-all hover:-translate-y-0.5 active:scale-[0.96]"
          style={{ border: `1px solid ${SAVINGS_COLOUR}60` }}
        >
          <div className="relative z-10 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-caption font-medium text-label-secondary/80">Savings</p>
              <PiggyBank size={14} style={{ color: SAVINGS_COLOUR }} className="shrink-0" />
            </div>
            <p
              className={cn(
                "text-title3 font-bold tracking-tight tabular-nums text-label",
                settings.hideAmounts && "font-mono tracking-widest text-label-secondary/50",
              )}
            >
              {formatCurrencyAmount(savings.total, allWallets.primaryCurrency, {
                decimals: settings.showDecimals ? undefined : 0,
                obfuscate: settings.hideAmounts,
              })}
            </p>
          </div>
        </div>
      ) : null}

      <div
        onClick={() => router.push("/budget/accounts?create=true")}
        className="group relative flex min-w-[144px] shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-separator/30 bg-transparent p-4 text-label-secondary shadow-none transition-all hover:border-accent/40 hover:bg-accent/5 hover:text-accent active:scale-[0.96]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-fill/5 transition-transform group-hover:scale-110 group-hover:bg-accent/10">
          <Plus size={20} weight="bold" />
        </div>
        <p className="text-caption font-semibold">Add account</p>
      </div>

      <div
        onClick={() => router.push("/budget/accounts")}
        className="group relative flex min-w-[144px] shrink-0 cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] bg-accent/5 p-4 text-accent shadow-sm transition-all hover:bg-accent/10 active:scale-[0.96]"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 transition-transform group-hover:scale-110">
          <ArrowRight size={20} weight="bold" />
        </div>
        <p className="text-caption font-semibold">View all</p>
      </div>
    </div>
  );
}

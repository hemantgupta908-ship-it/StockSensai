"use client";

/**
 * Accounts (Cashew's "wallets"): balances, currency, and the primary account
 * that every cross-currency total is normalised into.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreditCard, Pencil, Star, Trash2, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { AccountType, type TransactionWallet } from "@/lib/budget/types";
import { getCreditCardStatus, isCreditCard, getTotalCreditOutstanding } from "@/lib/budget/credit";
import { getNetWorth, getWalletBalance } from "@/lib/budget/calculations";
import { CURRENCIES, getCurrencyInfo, formatCurrencyAmount } from "@/lib/budget/currency";
import { createBalanceCorrection } from "@/lib/budget/recurring";
import { createWallet, newId } from "@/lib/budget/factory";
import { ColourPicker, IconBadge, IconPicker } from "./icon-picker";
import { useBudget } from "./budget-provider";
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
} from "./budget-ui";

export function AccountsView() {
  const { wallets, transactions, allWallets, settings, updateSettings } = useBudget();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWallet | null>(null);

  const netWorth = useMemo(
    () => getNetWorth(allWallets, transactions),
    [allWallets, transactions],
  );

  const creditOutstanding = useMemo(
    () => getTotalCreditOutstanding(allWallets, transactions),
    [allWallets, transactions],
  );

  const sorted = [...wallets].sort((a, b) => a.order - b.order);

  return (
    <>
      <div className={cn("mb-4 grid gap-3", creditOutstanding > 0 && "sm:grid-cols-2")}>
        <Card className="text-center">
          <p className="text-caption uppercase tracking-wide text-label-secondary/50">Net worth</p>
          <Amount value={netWorth} className="text-largetitle font-semibold" colour />
          <p className="mt-1 text-caption text-label-secondary/50">
            Across {wallets.length} account{wallets.length === 1 ? "" : "s"}, in{" "}
            {getCurrencyInfo(allWallets.primaryCurrency)?.name ?? "your primary currency"}
          </p>
        </Card>

        {creditOutstanding > 0 ? (
          <Card className="text-center">
            <p className="text-caption uppercase tracking-wide text-label-secondary/50">
              Credit card dues
            </p>
            <Amount value={creditOutstanding} className="text-largetitle font-semibold text-red" />
            <p className="mt-1 text-caption text-label-secondary/50">
              Already deducted from net worth
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

                  // COMPACT LAYOUT (Cash & Investment)
                  if (group.type === "cash" || group.type === "investment") {
                    return (
                      <div
                        key={wallet.walletPk}
                        className="flex overflow-hidden rounded-[16px] bg-bg-secondary shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                        style={{
                          background: `linear-gradient(145deg, ${accentColour}10 0%, transparent 100%)`,
                        }}
                      >
                        <Link
                          href={`/budget/accounts/${wallet.walletPk}`}
                          className="flex flex-1 items-center justify-between p-3 transition-transform active:scale-[0.98]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <IconBadge iconName={wallet.iconName} colour={wallet.colour} size={24} fallback={wallet.name} />
                            <div className="min-w-0">
                              <p className="truncate text-subhead font-medium text-label">{wallet.name}</p>
                              {isPrimary ? <p className="text-caption2 text-label-secondary/60">Primary</p> : null}
                            </div>
                          </div>
                          <span className={cn("shrink-0 text-subhead font-semibold tabular-nums", balance < 0 ? "text-red" : "text-label", settings.hideAmounts && "blur-[6px]")}>
                            {formatCurrencyAmount(balance, wallet.currency, { decimals: settings.showDecimals ? wallet.decimals : 0 })}
                          </span>
                        </Link>
                        <div className="flex items-center border-l border-separator/20">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(wallet);
                              setEditorOpen(true);
                            }}
                            className="flex h-full px-3 items-center justify-center text-label-secondary/40 hover:bg-fill/10 hover:text-label-secondary transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // STANDARD & CREDIT LAYOUT
                  return (
                    <div
                      key={wallet.walletPk}
                      className="flex flex-col overflow-hidden rounded-[24px] bg-bg-secondary transition-all shadow-[10px_10px_30px_rgba(0,0,0,0.12),-10px_-10px_30px_rgba(255,255,255,1)] dark:shadow-[10px_10px_30px_rgba(0,0,0,0.4),-10px_-10px_30px_rgba(255,255,255,0.05)] hover:shadow-[14px_14px_40px_rgba(0,0,0,0.16),-14px_-14px_40px_rgba(255,255,255,1)] dark:hover:shadow-[14px_14px_40px_rgba(0,0,0,0.5),-14px_-14px_40px_rgba(255,255,255,0.06)] active:shadow-[inset_6px_6px_16px_rgba(0,0,0,0.1),inset_-6px_-6px_16px_rgba(255,255,255,0.8)] dark:active:shadow-[inset_6px_6px_16px_rgba(0,0,0,0.4),inset_-6px_-6px_16px_rgba(255,255,255,0.06)]"
                    >
                      <Link
                        href={`/budget/accounts/${wallet.walletPk}`}
                        className="flex-1 p-5 text-left"
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-headline text-label">
                              <IconBadge iconName={wallet.iconName} colour={wallet.colour} size={28} fallback={wallet.name} />
                              {card ? <CreditCard size={15} className="shrink-0 text-label-secondary/50" /> : null}
                              <span className="truncate tracking-tight">{wallet.name}</span>
                              {isPrimary ? <Star size={14} className="shrink-0 fill-amber text-amber" /> : null}
                            </p>
                            <p className="mt-0.5 text-caption text-label-secondary/60">
                              {card ? "Credit card · " : ""}
                              {getCurrencyInfo(wallet.currency)?.name ?? wallet.currency?.toUpperCase()}
                              {isPrimary ? " · Primary" : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                "block text-title2 font-semibold tracking-tight tabular-nums",
                                card ? (card.outstanding > 0 ? "text-red" : "text-green") : balance < 0 ? "text-red" : "text-label",
                                settings.hideAmounts && "blur-[6px]"
                              )}
                            >
                              {formatCurrencyAmount(card ? card.outstanding : balance, wallet.currency, {
                                decimals: settings.showDecimals ? wallet.decimals : 0,
                              })}
                            </span>
                            {card ? (
                              <span className="text-caption2 text-label-secondary/50">
                                {card.outstanding > 0 ? "owed" : "clear"}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Restore large details ONLY for credit cards */}
                        {card ? (
                          <div className="mt-4 border-t border-separator/30 pt-3">
                            {card.utilisation !== null ? (
                              <>
                                <ProgressBar
                                  percent={card.utilisation}
                                  colour={card.highUtilisation ? "rgb(var(--sys-orange))" : accentColour}
                                  height={6}
                                />
                                <div className="mt-1.5 flex justify-between text-caption text-label-secondary/60">
                                  <span>
                                    {Math.round(card.utilisation * 100)}% of {formatCurrencyAmount(wallet.creditLimit ?? 0, wallet.currency, { decimals: 0, compact: true })}
                                  </span>
                                  <span className="font-medium text-label">
                                    {formatCurrencyAmount(card.available ?? 0, wallet.currency, { decimals: 0 })} available
                                  </span>
                                </div>
                              </>
                            ) : null}

                            {card.nextDueDate ? (
                              <p
                                className={cn(
                                  "mt-1.5 text-caption",
                                  (card.daysUntilDue ?? 99) <= 3 && card.outstanding > 0
                                    ? "font-medium text-red"
                                    : "text-label-secondary/60"
                                )}
                              >
                                Due {card.nextDueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                {card.daysUntilDue !== null ? ` · ${card.daysUntilDue} days` : ""}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </Link>

                      {/* Bottom action bar */}
                      <div className="flex items-center gap-2 bg-fill/5 px-4 py-2.5 border-t border-separator/10">
                        {!isPrimary ? (
                          <button
                            type="button"
                            onClick={() => updateSettings({ primaryWalletPk: wallet.walletPk })}
                            className="rounded-full bg-bg-secondary px-3 py-1 text-caption font-medium text-label-secondary shadow-sm ring-1 ring-black/5 transition-colors hover:bg-fill/10 dark:ring-white/10"
                          >
                            Set as primary
                          </button>
                        ) : null}
                        <div className="flex-1" />
                        <button
                          type="button"
                          aria-label={`Edit ${wallet.name}`}
                          onClick={() => {
                            setEditing(wallet);
                            setEditorOpen(true);
                          }}
                          className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium text-label-secondary/70 transition-colors hover:bg-fill/15 hover:text-label-secondary"
                        >
                          <Pencil size={14} />
                          <span>Edit</span>
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            aria-label={`Delete ${wallet.name}`}
                            onClick={() => {
                              setEditing(wallet);
                              setEditorOpen(true);
                            }}
                            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium text-red/70 transition-colors hover:bg-red/10 hover:text-red"
                          >
                            <Trash2 size={14} />
                            <span>Delete</span>
                          </button>
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
  const {
    wallets,
    transactions,
    settings,
    upsertWallet,
    deleteWallet,
    upsertTransaction,
    updateSettings,
  } = useBudget();

  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("inr");
  const [decimals, setDecimals] = useState("2");
  const [newBalance, setNewBalance] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [accountType, setAccountType] = useState(String(AccountType.bank));
  const [creditLimit, setCreditLimit] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [iconName, setIconName] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);

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
    } else {
      setName("");
      setCurrency(settings.primaryWalletPk ? "inr" : "inr");
      setDecimals("2");
      setNewBalance("");
      setMoveTo("");
      setOpeningBalance("");
      setAccountType(String(AccountType.bank));
      setCreditLimit("");
      setStatementDay("");
      setDueDay("");
      setIconName(null);
      setColour(null);
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
          date: new Date(),
          newPk: newId,
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
export function AccountsSummary() {
  const { wallets, transactions, settings } = useBudget();
  const sorted = [...wallets].sort((a, b) => a.order - b.order);

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {sorted.map((wallet) => {
        const balance = getWalletBalance(transactions, wallet.walletPk);
        const accentColour = wallet.colour ?? "#8E8E93";
        return (
          <Link
            key={wallet.walletPk}
            href={`/budget/accounts/${wallet.walletPk}`}
            className="group relative min-w-[144px] shrink-0 rounded-[18px] bg-bg-secondary p-4 shadow-sm transition-all hover:-translate-y-0.5 active:scale-[0.96]"
            style={{ border: `1px solid ${accentColour}60` }}
          >
            <div className="relative z-10 flex flex-col gap-2">
              <div className="mb-1 flex items-center justify-between">
                <IconBadge iconName={wallet.iconName} colour={wallet.colour} size={24} fallback={wallet.name} />
                <div className="h-2 w-2 rounded-full opacity-80" style={{ backgroundColor: accentColour }} />
              </div>
              <div>
                <p className="truncate text-caption font-medium text-label-secondary/80">{wallet.name}</p>
                <p
                  className={cn(
                    "text-title3 font-bold tracking-tight tabular-nums",
                    balance < 0 ? "text-red" : "text-label",
                    settings.hideAmounts && "blur-[6px]",
                  )}
                >
                  {formatCurrencyAmount(balance, wallet.currency, {
                    decimals: settings.showDecimals ? wallet.decimals : 0,
                    compact: true,
                  })}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

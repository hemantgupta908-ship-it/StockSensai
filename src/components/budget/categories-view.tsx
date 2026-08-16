"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Categories and subcategories.
 *
 * Category pk "0" is Cashew's reserved balance-correction category: it can be
 * renamed and recoloured but never deleted, because transfers depend on it.
 */

import { useMemo, useState } from "react";
import { CaretDown, Info, PencilSimpleLine, Plus, Shapes } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";
import { BALANCE_CORRECTION_CATEGORY_PK, TRANSFER_CATEGORY_PK, type TransactionCategory } from "@/lib/budget/types";
import { DEFAULT_CATEGORY_COLOUR } from "@/lib/budget/defaults";
import { ColourPicker, IconBadge, IconPicker } from "./icon-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { createCategory } from "@/lib/budget/factory";
import { useBudget, useCategoryLookup } from "./budget-provider";
import {
  AddFab,
  Amount,
  CategoryDot,
  ConfirmButton,
  EmptyState,
  PrimaryButton,
  SelectInput,
  Sheet,
} from "./budget-ui";

export function CategoriesView() {
  const { categories, transactions, allWallets } = useBudget(
    useShallow((s) => ({
      categories: s.categories,
      transactions: s.transactions,
      allWallets: s.allWallets,
    })),
  );
  const { main, subsByParent } = useCategoryLookup();
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionCategory | null>(null);
  const [presetParentPk, setPresetParentPk] = useState<string | undefined>(undefined);

  // Set of expanded category PKs for the accordion (default all expanded)
  const [expandedPks, setExpandedPks] = useState<Set<string>>(() => new Set(main.map((c) => c.categoryPk)));

  function toggleExpand(pk: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedPks((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }

  // Calculate totals per category & subcategory
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (!t.paid) continue;
      const amt = Math.abs(t.amount);
      map.set(t.categoryFk, (map.get(t.categoryFk) ?? 0) + amt);
      if (t.subCategoryFk) {
        map.set(t.subCategoryFk, (map.get(t.subCategoryFk) ?? 0) + amt);
      }
    }
    return map;
  }, [transactions]);

  const visible = useMemo(
    () =>
      main.filter(
        (c) =>
          c.income === (direction === "income") &&
          c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK &&
          c.categoryPk !== TRANSFER_CATEGORY_PK,
      ),
    [main, direction],
  );

  const totalTabSpend = useMemo(() => {
    let sum = 0;
    for (const c of visible) {
      sum += totals.get(c.categoryPk) ?? 0;
    }
    return sum;
  }, [visible, totals]);

  const correction = categories.find((c) => c.categoryPk === BALANCE_CORRECTION_CATEGORY_PK);
  const transfer = categories.find((c) => c.categoryPk === TRANSFER_CATEGORY_PK);

  return (
    <div className="space-y-4 pb-20">
      {/* 1. Type Switcher & Summary Metric Banner */}
      <div className="rounded-3xl border border-separator/40 bg-bg-secondary p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wider text-label-secondary/60">
              Total {direction === "expense" ? "Categorized Spending" : "Categorized Income"}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <Amount value={totalTabSpend} className="text-title1 sm:text-largetitle font-bold text-label tabular-nums" />
            </div>
          </div>

          <div className="sm:w-64">
            <SegmentedControl
              value={direction}
              onChange={(v) => setDirection(v as "expense" | "income")}
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* 2. Main Categories Accordion List */}
      {visible.length === 0 ? (
        <EmptyState icon={Shapes} title="No categories found" description="Tap the ＋ button to create your first category." />
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2">
          {visible.map((category) => {
            const subs = subsByParent.get(category.categoryPk) ?? [];
            const isExpanded = expandedPks.has(category.categoryPk);
            const parentSpend = totals.get(category.categoryPk) ?? 0;

            return (
              <div
                key={category.categoryPk}
                className="group rounded-3xl border border-separator/40 dark:border-white/10 bg-bg-secondary p-4 shadow-sm transition-all hover:shadow-md hover:border-separator/60"
              >
                {/* Category Header Row */}
                <div className="flex items-center justify-between gap-3">
                  <div
                    onClick={() => {
                      setEditing(category);
                      setPresetParentPk(undefined);
                      setEditorOpen(true);
                    }}
                    className="flex flex-1 cursor-pointer items-center gap-3 min-w-0"
                  >
                    <IconBadge
                      iconName={category.iconName}
                      colour={category.colour}
                      size={42}
                      fallback={category.name}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-headline font-semibold text-label group-hover:text-brand transition-colors">
                        {category.name}
                      </h3>
                      {subs.length > 0 ? (
                        <p className="text-caption font-medium text-label-secondary/60">
                          {subs.length} {subs.length === 1 ? "subcategory" : "subcategories"}
                        </p>
                      ) : (
                        <p className="text-caption font-medium text-label-secondary/40">Top-level</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Amount
                      value={parentSpend}
                      className="font-semibold text-subhead text-label tabular-nums"
                    />

                    {subs.length > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => toggleExpand(category.categoryPk, e)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-label-secondary hover:bg-fill/10 active:scale-95 transition-all"
                        aria-label={isExpanded ? "Collapse subcategories" : "Expand subcategories"}
                      >
                        <CaretDown
                          size={16}
                          weight="bold"
                          className={cn("transition-transform duration-200", isExpanded ? "rotate-180 text-label" : "")}
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(category);
                          setPresetParentPk(undefined);
                          setEditorOpen(true);
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-label-secondary/60 hover:text-label hover:bg-fill/10 active:scale-95 transition-all"
                        title="Edit category"
                      >
                        <PencilSimpleLine size={15} weight="bold" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Subcategories Accordion Content */}
                <AnimatePresence initial={false}>
                  {subs.length > 0 && isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3.5 space-y-2 border-t border-separator/30 pt-3 pl-3 sm:pl-4">
                        {subs.map((sub) => {
                          const subSpend = totals.get(sub.categoryPk) ?? 0;
                          const pct = parentSpend > 0 ? Math.min(100, Math.round((subSpend / parentSpend) * 100)) : 0;

                          return (
                            <button
                              key={sub.categoryPk}
                              type="button"
                              onClick={() => {
                                setEditing(sub);
                                setPresetParentPk(undefined);
                                setEditorOpen(true);
                              }}
                              className="group/sub flex w-full flex-col gap-1 rounded-2xl p-2 text-left transition-colors hover:bg-fill/5 active:scale-[0.99]"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <CategoryDot
                                    colour={sub.colour || category.colour}
                                    label={sub.name}
                                    emoji={sub.emojiIconName}
                                    iconName={sub.iconName}
                                    size={22}
                                  />
                                  <span className="truncate text-subhead font-medium text-label group-hover/sub:text-brand transition-colors">
                                    {sub.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-caption font-medium text-label-secondary/50">
                                    {pct}%
                                  </span>
                                  <Amount
                                    value={subSpend}
                                    className="text-footnote font-semibold text-label-secondary tabular-nums"
                                  />
                                </div>
                              </div>

                              {/* Progress bar of subcategory share */}
                              {parentSpend > 0 && (
                                <div className="ml-8 h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-fill/10">
                                  <div
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: sub.colour || category.colour || "var(--brand)",
                                    }}
                                  />
                                </div>
                              )}
                            </button>
                          );
                        })}

                        {/* Inline Add Subcategory button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            setPresetParentPk(category.categoryPk);
                            setEditorOpen(true);
                          }}
                          className="flex items-center gap-2 rounded-xl py-2 px-3 text-caption font-semibold text-brand hover:bg-brand/10 active:scale-95 transition-all mt-1"
                        >
                          <Plus size={14} weight="bold" />
                          <span>Add subcategory to {category.name}</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Reserved System Categories (Transfers & Adjustments) */}
      {(correction || transfer) && direction === "expense" ? (
        <div className="pt-4 space-y-2.5">
          <p className="text-caption font-semibold uppercase tracking-wider text-label-secondary/60 px-1 flex items-center gap-1.5">
            <Info size={14} weight="bold" />
            <span>System Categories</span>
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            {transfer ? (
              <div
                onClick={() => {
                  setEditing(transfer);
                  setPresetParentPk(undefined);
                  setEditorOpen(true);
                }}
                className="cursor-pointer rounded-3xl border border-separator/40 bg-bg-secondary p-4 shadow-sm hover:shadow-md transition-all flex items-center gap-3.5"
              >
                <CategoryDot colour={transfer.colour} label={transfer.name} iconName={transfer.iconName} size={38} />
                <div className="min-w-0 flex-1">
                  <h4 className="text-subhead font-semibold text-label">{transfer.name}</h4>
                  <p className="text-caption text-label-secondary/60">
                    Moves money between accounts without altering income/expense totals.
                  </p>
                </div>
              </div>
            ) : null}

            {correction ? (
              <div
                onClick={() => {
                  setEditing(correction);
                  setPresetParentPk(undefined);
                  setEditorOpen(true);
                }}
                className="cursor-pointer rounded-3xl border border-separator/40 bg-bg-secondary p-4 shadow-sm hover:shadow-md transition-all flex items-center gap-3.5"
              >
                <CategoryDot colour={correction.colour} label={correction.name} iconName={correction.iconName} size={38} />
                <div className="min-w-0 flex-1">
                  <h4 className="text-subhead font-semibold text-label">{correction.name}</h4>
                  <p className="text-caption text-label-secondary/60">
                    Used for manual balance reconciliations and adjustments.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Floating Action Button */}
      <AddFab
        onClick={() => {
          setEditing(null);
          setPresetParentPk(undefined);
          setEditorOpen(true);
        }}
        label="Add category"
      />

      <CategoryEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
          setPresetParentPk(undefined);
        }}
        editing={editing}
        defaultIncome={direction === "income"}
        defaultMainCategoryPk={presetParentPk}
      />
    </div>
  );
}

export function CategoryEditor({
  open,
  editing,
  defaultIncome,
  defaultMainCategoryPk,
  onClose,
  onCreated,
}: {
  open: boolean;
  editing?: TransactionCategory | null;
  defaultIncome: boolean;
  defaultMainCategoryPk?: string;
  onClose: () => void;
  onCreated?: (category: TransactionCategory) => void;
}) {
  const { categories, upsertCategory, deleteCategory } = useBudget(
    useShallow((s) => ({
      categories: s.categories,
      upsertCategory: s.upsertCategory,
      deleteCategory: s.deleteCategory,
    })),
  );
  const { main } = useCategoryLookup();

  const [name, setName] = useState("");
  const [colour, setColour] = useState(DEFAULT_CATEGORY_COLOUR);
  const [iconName, setIconName] = useState<string | null>(null);
  const [income, setIncome] = useState(defaultIncome);
  const [mainCategoryPk, setMainCategoryPk] = useState(defaultMainCategoryPk ?? "");
  const [moveTo, setMoveTo] = useState("");

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = editing?.categoryPk ?? (defaultMainCategoryPk ? `new-sub-${defaultMainCategoryPk}` : "new");
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    if (editing) {
      setName(editing.name);
      setColour(editing.colour ?? DEFAULT_CATEGORY_COLOUR);
      setIconName(editing.iconName);
      setIncome(editing.income);
      setMainCategoryPk(editing.mainCategoryPk ?? "");
      setMoveTo("");
    } else {
      setName("");
      setColour(DEFAULT_CATEGORY_COLOUR);
      setIconName(null);
      setIncome(defaultIncome);
      setMainCategoryPk(defaultMainCategoryPk ?? "");
      setMoveTo("");
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const isReserved =
    editing?.categoryPk === BALANCE_CORRECTION_CATEGORY_PK ||
    editing?.categoryPk === TRANSFER_CATEGORY_PK;

  function handleSave() {
    const base = editing ?? createCategory();
    const next = {
      ...base,
      name: name.trim() || "Category",
      colour,
      iconName,
      income: isReserved ? base.income : income,
      mainCategoryPk: mainCategoryPk || null,
      order: editing?.order ?? categories.length,
    };
    upsertCategory(next);
    if (!editing) onCreated?.(next);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit Category" : "New Category"}
      footer={
        <div className="space-y-2 pt-2">
          <PrimaryButton onClick={handleSave} disabled={!name.trim()} className="h-12 rounded-2xl font-semibold shadow-sm w-full">
            {editing ? "Save Changes" : "Create Category"}
          </PrimaryButton>
          {editing && !isReserved ? (
            <ConfirmButton
              idleLabel="Delete Category"
              confirmLabel={
                moveTo ? "Tap again to move & delete" : "Tap again — deletes its transactions"
              }
              onConfirm={() => {
                deleteCategory(editing.categoryPk, moveTo || undefined);
                onClose();
              }}
            />
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Top Hero Preview Badge & Centered Name */}
        <div className="flex flex-col items-center justify-center pb-1 pt-1 text-center">
          <div className="relative mb-2">
            <IconBadge iconName={iconName} colour={colour} size={64} fallback={name || "?"} />
          </div>
          <div className="w-full max-w-[280px]">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category Name"
              className="w-full bg-fill/5 hover:bg-fill/10 focus:bg-fill/10 border border-separator/40 focus:border-brand text-center text-title3 font-bold tracking-tight text-label placeholder:text-label-secondary/40 rounded-2xl px-4 py-2 outline-none transition-all"
              autoFocus={!editing}
            />
          </div>
        </div>

        {/* Expense vs Income Type Switcher */}
        {!isReserved ? (
          <SegmentedControl
            value={income ? "income" : "expense"}
            onChange={(v) => {
              const nextIncome = v === "income";
              setIncome(nextIncome);
              if (mainCategoryPk) setMainCategoryPk("");
            }}
            options={[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ]}
          />
        ) : null}

        {/* Icon & Colour Pickers */}
        <IconPicker value={iconName} colour={colour} onChange={setIconName} />
        <ColourPicker value={colour} onChange={setColour} />

        {/* Grouped Settings Inset Card */}
        {!isReserved ? (
          <div className="rounded-2xl border border-separator/30 bg-fill/5 divide-y divide-separator/20">
            <div className="p-3.5 space-y-1.5">
              <label className="block text-caption font-semibold uppercase tracking-wider text-label-secondary/60">
                Subcategory of
              </label>
              <SelectInput
                value={mainCategoryPk}
                onChange={(e) => setMainCategoryPk(e.target.value)}
                className="w-full bg-bg-secondary/70"
              >
                <option value="">None (Top-Level Category)</option>
                {main
                  .filter(
                    (c) =>
                      c.categoryPk !== editing?.categoryPk &&
                      c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK &&
                      c.income === income,
                  )
                  .map((c) => (
                    <option key={c.categoryPk} value={c.categoryPk}>
                      {c.name}
                    </option>
                  ))}
              </SelectInput>
            </div>

            {editing ? (
              <div className="p-3.5 space-y-1.5">
                <label className="block text-caption font-semibold uppercase tracking-wider text-label-secondary/60">
                  On delete, move transactions to
                </label>
                <SelectInput
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  className="w-full bg-bg-secondary/70"
                >
                  <option value="">Delete them</option>
                  {categories
                    .filter((c) => c.categoryPk !== editing.categoryPk && c.income === income)
                    .map((c) => (
                      <option key={c.categoryPk} value={c.categoryPk}>
                        {c.name}
                      </option>
                    ))}
                </SelectInput>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-2xl bg-fill/10 p-3.5 text-caption text-label-secondary/70">
            This is the reserved balance-correction category. It can be renamed and recoloured, but
            not deleted — account transfers depend on it.
          </p>
        )}
      </div>
    </Sheet>
  );
}

export const CategoryModal = CategoryEditor;

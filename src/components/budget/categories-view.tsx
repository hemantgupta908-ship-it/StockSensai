"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * Categories and subcategories.
 *
 * Category pk "0" is Cashew's reserved balance-correction category: it can be
 * renamed and recoloured but never deleted, because transfers depend on it.
 */

import { useMemo, useState } from "react";
import { Shapes } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { BALANCE_CORRECTION_CATEGORY_PK, TRANSFER_CATEGORY_PK, type TransactionCategory } from "@/lib/budget/types";
import { DEFAULT_CATEGORY_COLOUR } from "@/lib/budget/defaults";
import { ColourPicker, IconPicker } from "./icon-picker";
import { createCategory } from "@/lib/budget/factory";
import { useBudget, useCategoryLookup } from "./budget-provider";
import {
  AddFab,
  Amount,
  Card,
  CategoryDot,
  ConfirmButton,
  EmptyState,
  Field,
  PrimaryButton,
  SegmentedTabs,
  SelectInput,
  Sheet,
  TextInput,
  Toggle,
} from "./budget-ui";

export function CategoriesView() {
  const { categories, transactions, allWallets  } = useBudget(useShallow((s) => ({ categories: s.categories, transactions: s.transactions, allWallets: s.allWallets })));
  const { main, subsByParent } = useCategoryLookup();
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionCategory | null>(null);

  // Totals give the list a sense of scale, as Cashew's category page does.
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

  const visible = main.filter(
    (c) => 
      c.income === (direction === "income") && 
      c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK &&
      c.categoryPk !== TRANSFER_CATEGORY_PK,
  );
  const correction = categories.find((c) => c.categoryPk === BALANCE_CORRECTION_CATEGORY_PK);
  const transfer = categories.find((c) => c.categoryPk === TRANSFER_CATEGORY_PK);

  return (
    <>
      <SegmentedTabs
        className="mb-4"
        value={direction}
        onChange={setDirection}
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState icon={Shapes} title="No categories found" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((category) => {
            const subs = subsByParent.get(category.categoryPk) ?? [];
            return (
              <Card key={category.categoryPk} className="!p-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(category);
                    setEditorOpen(true);
                  }}
                  className="flex w-full items-center gap-3 text-left"
                >
                  <CategoryDot
                    colour={category.colour}
                    label={category.name}
                    emoji={category.emojiIconName}
                    iconName={category.iconName}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-subhead text-label">{category.name}</span>
                    {subs.length > 0 ? (
                      <span className="block text-caption text-label-secondary/60">
                        {subs.length} subcategor{subs.length === 1 ? "y" : "ies"}
                      </span>
                    ) : null}
                  </span>
                  <Amount
                    value={totals.get(category.categoryPk) ?? 0}
                    className="shrink-0 text-footnote text-label-secondary"
                  />
                </button>

                {subs.length > 0 ? (
                  <div className="mt-2 space-y-1 border-t border-separator/40 pt-2 pl-11">
                    {subs.map((sub) => (
                      <button
                        key={sub.categoryPk}
                        type="button"
                        onClick={() => {
                          setEditing(sub);
                          setEditorOpen(true);
                        }}
                        className="flex w-full items-center justify-between gap-2 text-left py-0.5 hover:bg-fill/5 rounded-md px-1 -mx-1"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CategoryDot
                            colour={sub.colour}
                            label={sub.name}
                            emoji={sub.emojiIconName}
                            iconName={sub.iconName}
                            size={18}
                          />
                          <span className="truncate text-caption text-label-secondary">
                            {sub.name}
                          </span>
                        </div>
                        <Amount
                          value={totals.get(sub.categoryPk) ?? 0}
                          className="text-caption text-label-secondary/60"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {(correction || transfer) && direction === "expense" ? (
        <div className="mt-6">
          <div className="space-y-3">
            {transfer ? (
              <Card
                className="!p-3"
                onClick={() => {
                  setEditing(transfer);
                  setEditorOpen(true);
                }}
              >
                <div className="flex items-center gap-3">
                  <CategoryDot
                    colour={transfer.colour}
                    label={transfer.name}
                    iconName={transfer.iconName}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-subhead text-label">{transfer.name}</p>
                    <p className="text-caption text-label-secondary/60">
                      Moves money between your accounts without affecting income or expense totals.
                    </p>
                  </div>
                </div>
              </Card>
            ) : null}

            {correction ? (
              <Card
                className="!p-3"
                onClick={() => {
                  setEditing(correction);
                  setEditorOpen(true);
                }}
              >
                <div className="flex items-center gap-3">
                  <CategoryDot
                    colour={correction.colour}
                    label={correction.name}
                    iconName={correction.iconName}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-subhead text-label">{correction.name}</p>
                    <p className="text-caption text-label-secondary/60">
                      Transactions here don&apos;t count as income or expense, but do move account balances.
                    </p>
                  </div>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      <AddFab
        onClick={() => {
          setEditing(null);
          setEditorOpen(true);
        }}
        label="Add category"
      />
      <CategoryEditor
        open={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        editing={editing}
        defaultIncome={direction === "income"}
      />
    </>
  );
}

export function CategoryEditor({
  open,
  onClose,
  editing,
  defaultIncome,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  editing?: TransactionCategory | null;
  defaultIncome: boolean;
  /** Lets a picker select the category it just created. */
  onCreated?: (category: TransactionCategory) => void;
}) {
  const { categories, upsertCategory, deleteCategory  } = useBudget(useShallow((s) => ({ categories: s.categories, upsertCategory: s.upsertCategory, deleteCategory: s.deleteCategory })));
  const { main } = useCategoryLookup();

  const [name, setName] = useState("");
  const [colour, setColour] = useState(DEFAULT_CATEGORY_COLOUR);
  const [iconName, setIconName] = useState<string | null>(null);
  const [income, setIncome] = useState(defaultIncome);
  const [mainCategoryPk, setMainCategoryPk] = useState("");
  const [moveTo, setMoveTo] = useState("");

  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = editing?.categoryPk ?? "new";
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
      setMainCategoryPk("");
      setMoveTo("");
    }
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const isReserved = editing?.categoryPk === BALANCE_CORRECTION_CATEGORY_PK || editing?.categoryPk === TRANSFER_CATEGORY_PK;

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
      title={editing ? "Edit Category" : "Add Category"}
      footer={
        <div className="space-y-2">
          <PrimaryButton onClick={handleSave} disabled={!name.trim()}>
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
      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Groceries" />
      </Field>

      <IconPicker value={iconName} colour={colour} onChange={setIconName} />

      <ColourPicker value={colour} onChange={setColour} />

      {!isReserved ? (
        <>
          <Toggle checked={income} onChange={setIncome} label="Income category" />

          <Field label="Subcategory of" hint="Leave as 'None' for a top-level category.">
            <SelectInput
              value={mainCategoryPk}
              onChange={(e) => setMainCategoryPk(e.target.value)}
            >
              <option value="">None</option>
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
          </Field>

          {editing ? (
            <Field label="On delete, move transactions to">
              <SelectInput value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Delete them</option>
                {categories
                  .filter((c) => c.categoryPk !== editing.categoryPk && c.income === income)
                  .map((c) => (
                    <option key={c.categoryPk} value={c.categoryPk}>
                      {c.name}
                    </option>
                  ))}
              </SelectInput>
            </Field>
          ) : null}
        </>
      ) : (
        <p className="rounded-ios bg-fill/10 px-3 py-2 text-caption text-label-secondary/70">
          This is the reserved balance-correction category. It can be renamed and recoloured, but
          not deleted — account transfers depend on it.
        </p>
      )}
    </Sheet>
  );
}

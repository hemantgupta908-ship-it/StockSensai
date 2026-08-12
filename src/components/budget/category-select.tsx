"use client";
import { useShallow } from "zustand/react/shallow";

/**
 * A category dropdown that can also create a category without leaving the form.
 *
 * Every screen that assigns a category uses this, so "＋ New category…" behaves
 * identically everywhere and the new category is selected on return — otherwise
 * you would have to abandon a half-filled form, go to Categories, and start over.
 *
 * Filtering stays with the caller: a policy wants expense categories, a loan
 * repayment wants whichever direction the repayment runs.
 */

import { useState } from "react";

import { useBudget } from "./budget-provider";
import { SelectInput } from "./budget-ui";
import { CategoryEditor } from "./categories-view";
import { BALANCE_CORRECTION_CATEGORY_PK, TRANSFER_CATEGORY_PK } from "@/lib/budget/types";
import type { TransactionCategory } from "@/lib/budget/types";

/** Sentinel value; no category can hold it, so it cannot collide with a pk. */
const NEW_CATEGORY = "__new__";

export function CategorySelect({
  value,
  onChange,
  filter,
  placeholder,
  defaultIncome = false,
  includeReserved = false,
}: {
  value: string;
  onChange: (categoryPk: string) => void;
  filter?: (category: TransactionCategory) => boolean;
  /** Shown as an empty first option, e.g. "Select category". Omit to require one. */
  placeholder?: string;
  /** Direction a newly created category should default to. */
  defaultIncome?: boolean;
  /** Transfer and Balance Correction are written by their own flows. */
  includeReserved?: boolean;
}) {
  const { categories  } = useBudget(useShallow((s) => ({ categories: s.categories })));
  const [editorOpen, setEditorOpen] = useState(false);

  const options = categories
    .filter(
      (c) =>
        includeReserved ||
        (c.categoryPk !== BALANCE_CORRECTION_CATEGORY_PK &&
          c.categoryPk !== TRANSFER_CATEGORY_PK),
    )
    .filter((c) => (filter ? filter(c) : true));

  return (
    <>
      <SelectInput
        value={value}
        onChange={(e) => {
          if (e.target.value === NEW_CATEGORY) {
            setEditorOpen(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((c) => (
          <option key={c.categoryPk} value={c.categoryPk}>
            {c.name}
          </option>
        ))}
        <option value={NEW_CATEGORY}>＋ New category…</option>
      </SelectInput>

      <CategoryEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        defaultIncome={defaultIncome}
        onCreated={(category) => onChange(category.categoryPk)}
      />
    </>
  );
}

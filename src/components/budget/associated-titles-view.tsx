"use client";

import { useState } from "react";
import { Tag, Trash } from "@phosphor-icons/react";

import { newId } from "@/lib/budget/factory";
import { useBudget, useCategoryLookup } from "./budget-provider";
import {
  Card,
  CategoryDot,
  EmptyState,
  Field,
  PrimaryButton,
  Section,
  TextInput,
  Toggle,
} from "./budget-ui";
import { CategorySelect } from "./category-select";

export function AssociatedTitlesView() {
  const { associatedTitles, upsertAssociatedTitle, deleteAssociatedTitle } = useBudget();
  const { byPk } = useCategoryLookup();

  const [title, setTitle] = useState("");
  const [categoryFk, setCategoryFk] = useState("");
  const [exact, setExact] = useState(false);

  const sorted = [...associatedTitles].sort((a, b) => a.title.localeCompare(b.title));

  function add() {
    if (!title.trim() || !categoryFk) return;
    upsertAssociatedTitle({
      associatedTitlePk: newId(),
      categoryFk,
      title: title.trim(),
      dateCreated: new Date().toISOString(),
      dateTimeModified: new Date().toISOString(),
      order: associatedTitles.length,
      isExactMatch: exact,
    });
    setTitle("");
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Section title="Associated Titles">
        <Card className="space-y-5">
          <p className="text-caption text-label-secondary/70">
            Titles store the relationship between a category and a transaction name. When you type a matching name, the category is automatically filled in for you.
          </p>

          <Field label="Title Name">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Starbucks, Netflix, Amazon"
            />
          </Field>
          <Field label="Auto Category">
            <CategorySelect
              value={categoryFk}
              onChange={setCategoryFk}
              placeholder="Select target category"
            />
          </Field>
          <Toggle
            checked={exact}
            onChange={setExact}
            label="Exact match only"
            description="Otherwise the title matches anywhere within the transaction name."
          />
          <PrimaryButton onClick={add} disabled={!title.trim() || !categoryFk} className="mb-4">
            Add Title Rule
          </PrimaryButton>

          <h4 className="text-caption font-semibold uppercase tracking-wider text-label-secondary/70 pt-2">
            Active Rules ({sorted.length})
          </h4>

          {sorted.length === 0 ? (
            <EmptyState icon={Tag} title="No titles rules created yet" description="Create a title rule above to enable automatic category auto-completion." />
          ) : (
            <div className="divide-y divide-separator/40 overflow-hidden rounded-card bg-bg-secondary border border-separator/20 dark:border-white/10">
              {sorted.map((t) => {
                const category = byPk.get(t.categoryFk);
                return (
                  <div key={t.associatedTitlePk} className="flex items-center gap-3 px-4 py-3">
                    <CategoryDot colour={category?.colour} label={category?.name} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-subhead font-semibold text-label">{t.title}</span>
                      <span className="block text-caption text-label-secondary/60">
                        {category?.name ?? "Unknown"}
                        {t.isExactMatch ? " · exact match" : " · partial match"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => deleteAssociatedTitle(t.associatedTitlePk)}
                      aria-label={`Delete ${t.title}`}
                      className="shrink-0 rounded-full p-2 text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}

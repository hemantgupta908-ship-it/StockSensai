"use client";

/**
 * The "More" hub: everything that doesn't earn a tab, plus the two standalone
 * tools Cashew ships — the bill splitter and the associated-titles editor.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { CaretRight, Plus, Receipt, Tag, Trash, Users } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/budget/currency";
import { newId } from "@/lib/budget/factory";
import { BUDGET_NAV_SECTIONS } from "./budget-nav";
import { useBudget, useCategoryLookup } from "./budget-provider";
import {
  Card,
  CategoryDot,
  EmptyState,
  Field,
  PrimaryButton,
  Section,
  Sheet,
  TextInput,
  Toggle,
} from "./budget-ui";
import { CategorySelect } from "./category-select";

export function MoreView() {
  const [billSplitterOpen, setBillSplitterOpen] = useState(false);
  const [titlesOpen, setTitlesOpen] = useState(false);

  return (
    <>
      {BUDGET_NAV_SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          <div className="divide-y divide-separator/40 overflow-hidden rounded-card bg-bg-secondary">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-fill/5"
                >
                  <Icon size={19} className="shrink-0 text-label-secondary/60" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-subhead text-label">{item.label}</span>
                    <span className="block text-caption text-label-secondary/60">
                      {item.description}
                    </span>
                  </span>
                  <CaretRight size={17} className="shrink-0 text-label-secondary/30" />
                </Link>
              );
            })}
          </div>
        </Section>
      ))}

      <Section title="Tools">
        <div className="divide-y divide-separator/40 overflow-hidden rounded-card bg-bg-secondary">
          <button
            type="button"
            onClick={() => setBillSplitterOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fill/5"
          >
            <Users size={19} className="shrink-0 text-label-secondary/60" />
            <span className="min-w-0 flex-1">
              <span className="block text-subhead text-label">Bill splitter</span>
              <span className="block text-caption text-label-secondary/60">
                Split a bill you paid amongst other people
              </span>
            </span>
            <CaretRight size={17} className="shrink-0 text-label-secondary/30" />
          </button>

          <button
            type="button"
            onClick={() => setTitlesOpen(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-fill/5"
          >
            <Tag size={19} className="shrink-0 text-label-secondary/60" />
            <span className="min-w-0 flex-1">
              <span className="block text-subhead text-label">Associated titles</span>
              <span className="block text-caption text-label-secondary/60">
                Autocomplete a category from a transaction name
              </span>
            </span>
            <CaretRight size={17} className="shrink-0 text-label-secondary/30" />
          </button>
        </div>
      </Section>

      <BillSplitter open={billSplitterOpen} onClose={() => setBillSplitterOpen(false)} />
      <AssociatedTitlesSheet open={titlesOpen} onClose={() => setTitlesOpen(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bill splitter
// ---------------------------------------------------------------------------

interface BillItem {
  id: string;
  name: string;
  cost: string;
  /** Names sharing this item; the cost divides evenly between them. */
  people: string[];
}

/**
 * Split a bill amongst people.
 *
 * Cashew's model: each item names who shares it, its cost divides evenly
 * between them, and a multiplier applies to every item (for tax or tip).
 */
function BillSplitter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { allWallets } = useBudget();
  const [people, setPeople] = useState<string[]>([]);
  const [newPerson, setNewPerson] = useState("");
  const [items, setItems] = useState<BillItem[]>([]);
  const [multiplier, setMultiplier] = useState("1");

  const totals = useMemo(() => {
    const perPerson = new Map<string, number>();
    for (const person of people) perPerson.set(person, 0);
    let grand = 0;

    const factor = Number(multiplier) || 1;
    for (const item of items) {
      const cost = (Number(item.cost) || 0) * factor;
      grand += cost;
      const sharers = item.people.length > 0 ? item.people : people;
      if (sharers.length === 0) continue;
      const share = cost / sharers.length;
      for (const person of sharers) {
        perPerson.set(person, (perPerson.get(person) ?? 0) + share);
      }
    }
    return { perPerson, grand };
  }, [items, people, multiplier]);

  function addPerson() {
    const name = newPerson.trim();
    if (!name || people.includes(name)) return;
    setPeople((p) => [...p, name]);
    setNewPerson("");
  }

  function toggleSharer(itemId: string, person: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              people: item.people.includes(person)
                ? item.people.filter((p) => p !== person)
                : [...item.people, person],
            }
          : item,
      ),
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Bill Splitter"
      footer={
        <div className="space-y-1.5">
          {[...totals.perPerson.entries()].map(([person, amount]) => (
            <div key={person} className="flex justify-between text-subhead">
              <span className="text-label">{person}</span>
              <span className="font-semibold tabular-nums text-label">
                {formatCurrencyAmount(amount, allWallets.primaryCurrency)}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t border-separator/40 pt-1.5 text-subhead">
            <span className="text-label-secondary">Total</span>
            <span className="font-semibold tabular-nums text-label">
              {formatCurrencyAmount(totals.grand, allWallets.primaryCurrency)}
            </span>
          </div>
        </div>
      }
    >
      <p className="mb-4 text-caption text-label-secondary/60">
        Split a bill you paid amongst the people who bought items, so you can keep track of who owes
        you what.
      </p>

      <Field label="People">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {people.map((person) => (
            <button
              key={person}
              type="button"
              onClick={() => {
                setPeople((p) => p.filter((x) => x !== person));
                setItems((current) =>
                  current.map((i) => ({ ...i, people: i.people.filter((x) => x !== person) })),
                );
              }}
              className="flex items-center gap-1 rounded-full bg-green/12 px-3 py-1.5 text-caption text-green"
            >
              {person}
              <Trash size={11} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <TextInput
            value={newPerson}
            onChange={(e) => setNewPerson(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPerson();
              }
            }}
            placeholder="Name"
          />
          <button
            type="button"
            onClick={addPerson}
            className="shrink-0 rounded-ios bg-green px-4 text-white"
            aria-label="Add person"
          >
            <Plus size={18} />
          </button>
        </div>
      </Field>

      <Field label="Multiplier" hint="Applied to every item — useful when tax is charged per item.">
        <TextInput
          type="number"
          step="0.01"
          min="0"
          value={multiplier}
          onChange={(e) => setMultiplier(e.target.value)}
        />
      </Field>

      <Field label="Items">
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-ios bg-fill/8 p-2.5">
              <div className="mb-2 flex gap-2">
                <TextInput
                  value={item.name}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((i) => (i.id === item.id ? { ...i, name: e.target.value } : i)),
                    )
                  }
                  placeholder="Item"
                />
                <TextInput
                  type="number"
                  step="0.01"
                  className="w-28 shrink-0"
                  value={item.cost}
                  onChange={(e) =>
                    setItems((current) =>
                      current.map((i) => (i.id === item.id ? { ...i, cost: e.target.value } : i)),
                    )
                  }
                  placeholder="0.00"
                />
                <button
                  type="button"
                  onClick={() => setItems((current) => current.filter((i) => i.id !== item.id))}
                  aria-label="Remove item"
                  className="shrink-0 rounded-ios px-2 text-label-secondary/50 hover:bg-fill/15"
                >
                  <Trash size={15} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {people.length === 0 ? (
                  <span className="text-caption text-label-secondary/50">Add people first</span>
                ) : (
                  people.map((person) => {
                    const active = item.people.includes(person);
                    return (
                      <button
                        key={person}
                        type="button"
                        onClick={() => toggleSharer(item.id, person)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-caption2 transition-colors",
                          active ? "bg-green text-white" : "bg-fill/15 text-label-secondary",
                        )}
                      >
                        {person}
                      </button>
                    );
                  })
                )}
              </div>
              {item.people.length === 0 && people.length > 0 ? (
                <p className="mt-1.5 text-caption2 text-label-secondary/50">
                  Nobody selected — split evenly between everyone.
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            setItems((current) => [...current, { id: newId(), name: "", cost: "", people: [] }])
          }
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-ios bg-fill/10 py-2.5 text-subhead font-medium text-label-secondary"
        >
          <Plus size={16} /> Add item
        </button>
      </Field>

      {items.length === 0 ? (
        <EmptyState icon={Receipt} title="No items yet" description="Add people, then add items." />
      ) : null}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Associated titles
// ---------------------------------------------------------------------------

function AssociatedTitlesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <Sheet open={open} onClose={onClose} title="Associated Titles">
      <p className="mb-4 text-caption text-label-secondary/60">
        Titles store the relationship between a category and a transaction name. When you type a
        matching name, the category is filled in for you.
      </p>

      <Field label="Title">
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Starbucks"
        />
      </Field>
      <Field label="Category">
        <CategorySelect
          value={categoryFk}
          onChange={setCategoryFk}
          placeholder="Select category"
        />
      </Field>
      <Toggle
        checked={exact}
        onChange={setExact}
        label="Exact match only"
        description="Otherwise the title matches anywhere in the transaction name."
      />
      <PrimaryButton onClick={add} disabled={!title.trim() || !categoryFk} className="mb-4">
        Add Title
      </PrimaryButton>

      {sorted.length === 0 ? (
        <EmptyState icon={Tag} title="No titles found" />
      ) : (
        <div className="divide-y divide-separator/40 overflow-hidden rounded-card bg-bg-secondary">
          {sorted.map((t) => {
            const category = byPk.get(t.categoryFk);
            return (
              <div key={t.associatedTitlePk} className="flex items-center gap-3 px-3 py-2.5">
                <CategoryDot colour={category?.colour} label={category?.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead text-label">{t.title}</span>
                  <span className="block text-caption text-label-secondary/60">
                    {category?.name ?? "Unknown"}
                    {t.isExactMatch ? " · exact" : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => deleteAssociatedTitle(t.associatedTitlePk)}
                  aria-label={`Delete ${t.title}`}
                  className="shrink-0 rounded-full p-1.5 text-label-secondary/50 hover:bg-fill/15"
                >
                  <Trash size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

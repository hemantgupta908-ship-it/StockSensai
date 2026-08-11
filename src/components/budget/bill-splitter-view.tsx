"use client";

import { useMemo, useState } from "react";
import { Plus, Receipt, Trash, Users } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/budget/currency";
import { newId } from "@/lib/budget/factory";
import { useBudget } from "./budget-provider";
import { Card, EmptyState, Field, Section, TextInput } from "./budget-ui";

interface BillItem {
  id: string;
  name: string;
  cost: string;
  people: string[];
}

export function BillSplitterView() {
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
    <div className="space-y-6 max-w-3xl mx-auto">
      <Section title="Bill Splitter">
        <Card className="space-y-5">
          <p className="text-caption text-label-secondary/70">
            Split a bill you paid amongst the people who bought items, so you can keep track of who owes you what.
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
                  className="flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1.5 text-caption font-medium text-accent hover:bg-accent/25 transition-colors"
                >
                  {person}
                  <Trash size={12} />
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
                placeholder="Add person name..."
              />
              <button
                type="button"
                onClick={addPerson}
                className="shrink-0 rounded-ios bg-accent px-4 text-white font-medium hover:opacity-90 active:scale-95 transition-all"
                aria-label="Add person"
              >
                <Plus size={18} />
              </button>
            </div>
          </Field>

          <Field label="Multiplier" hint="Applied to every item — useful when tax or tip is charged per item.">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
            />
          </Field>

          <Field label="Items">
            <div className="space-y-2.5">
              {items.map((item) => (
                <div key={item.id} className="rounded-ios bg-fill/10 p-3 space-y-2 border border-separator/20 dark:border-white/10">
                  <div className="flex gap-2">
                    <TextInput
                      value={item.name}
                      onChange={(e) =>
                        setItems((current) =>
                          current.map((i) => (i.id === item.id ? { ...i, name: e.target.value } : i)),
                        )
                      }
                      placeholder="Item description"
                    />
                    <TextInput
                      type="number"
                      step="0.01"
                      className="w-32 shrink-0"
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
                      className="shrink-0 rounded-ios px-2.5 text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash size={16} />
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
                              "rounded-full px-3 py-1 text-caption2 transition-all font-medium",
                              active ? "bg-accent text-white shadow-sm" : "bg-fill/15 text-label-secondary hover:bg-fill/25",
                            )}
                          >
                            {person}
                          </button>
                        );
                      })
                    )}
                  </div>
                  {item.people.length === 0 && people.length > 0 ? (
                    <p className="mt-1 text-caption2 text-label-secondary/50">
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
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-ios bg-accent/10 hover:bg-accent/20 py-2.5 text-subhead font-semibold text-accent transition-all"
            >
              <Plus size={16} /> Add item
            </button>
          </Field>

          {items.length === 0 ? (
            <EmptyState icon={Receipt} title="No items yet" description="Add people above, then add items to split." />
          ) : null}

          {/* Breakdown summary */}
          {people.length > 0 ? (
            <div className="mt-6 rounded-card bg-fill/5 p-4 space-y-2 border border-separator/20 dark:border-white/10">
              <h4 className="text-caption font-semibold uppercase tracking-wider text-label-secondary/70 mb-2">
                Summary Breakdown
              </h4>
              {[...totals.perPerson.entries()].map(([person, amount]) => (
                <div key={person} className="flex justify-between text-subhead">
                  <span className="text-label font-medium">{person}</span>
                  <span className="font-bold tabular-nums text-label">
                    {formatCurrencyAmount(amount, allWallets.primaryCurrency)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between border-t border-separator/40 pt-2 text-subhead font-bold">
                <span className="text-label-secondary">Total Bill</span>
                <span className="tabular-nums text-accent">
                  {formatCurrencyAmount(totals.grand, allWallets.primaryCurrency)}
                </span>
              </div>
            </div>
          ) : null}
        </Card>
      </Section>
    </div>
  );
}

// @vitest-environment jsdom

/**
 * What happens to a half-filled "add transaction" form.
 *
 * The sheet is rendered by whichever page opened it, so leaving that page —
 * a link, or Android's hardware back button, which is wired to `router.back()`
 * — unmounts it. These pin that the entry comes back, that a deliberate
 * dismissal asks before throwing it away, and that a stored transaction does
 * not leave a ghost behind.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";

import { TransactionModal } from "./transaction-modal";
import { dismissTopOverlay, openOverlayCount } from "@/lib/dismissible";
import { renderWithBudget, screen } from "@/test/render-budget";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const noop = () => {};

/**
 * The sheet portals to `document.body`, so it is mounted behind a marker the
 * harness can see — otherwise hydration is still being waited on when the
 * container looks empty.
 */
function host(ui: React.ReactElement) {
  return <div data-testid="host">{ui}</div>;
}

const amountField = () => screen.getByPlaceholderText("0.00") as HTMLInputElement;
const titleField = () => screen.getByPlaceholderText("e.g. Groceries") as HTMLInputElement;

/**
 * Backdate the stored draft to a previous page load, which is what the app
 * being killed in the background and relaunched leaves behind.
 */
function ageDraftToPreviousLoad() {
  const raw = localStorage.getItem("cashew.transaction-draft");
  if (!raw) throw new Error("no draft to age");
  localStorage.setItem(
    "cashew.transaction-draft",
    JSON.stringify({ ...JSON.parse(raw), documentId: "an-earlier-page-load" }),
  );
}

function fill(amount: string, title: string) {
  fireEvent.change(amountField(), { target: { value: amount } });
  fireEvent.change(titleField(), { target: { value: title } });
}

describe("TransactionModal drafts", () => {
  it("brings the entry back after the page it was on unmounts", async () => {
    const first = await renderWithBudget(host(<TransactionModal open onClose={noop} />));
    fill("125.50", "Coffee");

    // Navigating away: the page, and the sheet with it, simply goes.
    first.unmount();

    await renderWithBudget(host(<TransactionModal open onClose={noop} />));
    expect(amountField().value).toBe("125.50");
    expect(titleField().value).toBe("Coffee");
  });

  it("survives a parent re-render that passes fresh defaults", async () => {
    // Call sites pass an object literal, so the store ticking used to look like
    // a brand new sheet and reset the form mid-entry.
    function Harness() {
      const [n, setN] = useState(0);
      return (
        <>
          <button onClick={() => setN(n + 1)}>tick</button>
          <TransactionModal open onClose={noop} defaults={{ note: "" }} />
        </>
      );
    }

    await renderWithBudget(host(<Harness />));
    fill("42", "Lunch");
    fireEvent.click(screen.getByText("tick"));

    expect(amountField().value).toBe("42");
    expect(titleField().value).toBe("Lunch");
  });

  it("asks before discarding a started entry, and keeps it if told to", async () => {
    const onClose = vi.fn();
    await renderWithBudget(host(<TransactionModal open onClose={onClose} />));
    fill("60", "Taxi");

    fireEvent.click(screen.getAllByLabelText("Close")[0]);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Keep editing"));
    expect(amountField().value).toBe("60");
  });

  it("closes without asking when nothing has been filled in", async () => {
    const onClose = vi.fn();
    await renderWithBudget(host(<TransactionModal open onClose={onClose} />));

    fireEvent.click(screen.getAllByLabelText("Close")[0]);
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText("Discard this entry?")).toBeNull();
  });

  it("forgets a discarded entry", async () => {
    const first = await renderWithBudget(host(<TransactionModal open onClose={noop} />));
    fill("60", "Taxi");

    fireEvent.click(screen.getAllByLabelText("Close")[0]);
    fireEvent.click(screen.getByText("Discard"));
    first.unmount();

    await renderWithBudget(host(<TransactionModal open onClose={noop} />));
    expect(amountField().value).toBe("");
    expect(titleField().value).toBe("");
  });

  it("puts the sheet back on screen after the app is killed and relaunched", async () => {
    // Android evicts a backgrounded app freely; the WebView returns reloaded,
    // with every sheet closed. The entry has to come back with the sheet, not
    // wait to be re-opened by hand.
    const first = await renderWithBudget(
      host(<TransactionModal open onClose={noop} restoreOnRelaunch />),
    );
    fill("310", "Petrol");
    first.unmount();
    ageDraftToPreviousLoad();

    // Relaunched: nothing on the page has asked for the sheet.
    await renderWithBudget(host(<TransactionModal open={false} onClose={noop} restoreOnRelaunch />));
    expect(amountField().value).toBe("310");
    expect(titleField().value).toBe("Petrol");
  });

  it("stays closed on relaunch when there is no draft", async () => {
    await renderWithBudget(host(<TransactionModal open={false} onClose={noop} restoreOnRelaunch />));
    expect(screen.queryByPlaceholderText("0.00")).toBeNull();
  });

  it("does not reopen a sheet the user navigated away from in the same session", async () => {
    // Within one page load, leaving the page is a choice. The entry is kept,
    // but the sheet should not follow the user around the app.
    const first = await renderWithBudget(
      host(<TransactionModal open onClose={noop} restoreOnRelaunch />),
    );
    fill("75", "Books");
    first.unmount();

    await renderWithBudget(host(<TransactionModal open={false} onClose={noop} restoreOnRelaunch />));
    expect(screen.queryByPlaceholderText("0.00")).toBeNull();
  });

  it("closes a relaunched sheet when dismissed, even though the caller never opened it", async () => {
    const first = await renderWithBudget(
      host(<TransactionModal open onClose={noop} restoreOnRelaunch />),
    );
    fill("40", "Snacks");
    first.unmount();
    ageDraftToPreviousLoad();

    await renderWithBudget(host(<TransactionModal open={false} onClose={noop} restoreOnRelaunch />));
    fireEvent.click(screen.getAllByLabelText("Close")[0]);
    fireEvent.click(screen.getByText("Discard"));
    expect(screen.queryByPlaceholderText("0.00")).toBeNull();
  });

  it("forgets an entry that has been added", async () => {
    const first = await renderWithBudget(host(<TransactionModal open onClose={noop} />));
    fill("18", "Bus");
    fireEvent.click(screen.getByRole("button", { name: "Add Transaction" }));
    first.unmount();

    await renderWithBudget(host(<TransactionModal open onClose={noop} />));
    expect(amountField().value).toBe("");
    expect(titleField().value).toBe("");
  });
});

/**
 * Android's hardware back button, as `NativeShell` wires it: close the topmost
 * overlay, and only navigate when `dismissTopOverlay` reports there was none.
 *
 * The bug this pins: back on the add-transaction form fell straight through to
 * `router.back()`, which popped the transactions list off the history and left
 * the user on the home screen — a sheet is not a route, so the router had no
 * idea a form was on top of it.
 */
function pressBack(): boolean {
  let navigates = false;
  act(() => {
    navigates = !dismissTopOverlay();
  });
  return navigates;
}

/**
 * A touch device, which is what makes `AmountInput` present the app's own
 * keypad. jsdom has no `matchMedia` at all, so without this the sheet renders
 * in its pointer-device form and the keypad never appears.
 */
function useTouchDevice() {
  const original = window.matchMedia;
  beforeEach(() => {
    // The pad scrolls its field into view on open, from a `requestAnimationFrame`
    // that outlives the test. jsdom implements neither, and an unhandled throw
    // in a stray frame fails the run from outside any test.
    Element.prototype.scrollIntoView = () => {};
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = original;
  });
}

describe("TransactionModal and the hardware back button", () => {
  it("leaves nothing registered when no sheet is on screen", async () => {
    await renderWithBudget(host(<TransactionModal open={false} onClose={noop} />));
    expect(openOverlayCount()).toBe(0);
    // Nothing to close, so the back handler falls through and navigates.
    expect(pressBack()).toBe(true);
  });

  it("closes an untouched form instead of navigating", async () => {
    const onClose = vi.fn();
    await renderWithBudget(host(<TransactionModal open onClose={onClose} />));

    expect(pressBack()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("asks before throwing away a started entry", async () => {
    const onClose = vi.fn();
    await renderWithBudget(host(<TransactionModal open onClose={onClose} />));
    fill("120", "Groceries");

    expect(pressBack()).toBe(false);
    expect(screen.getByText("Discard this entry?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backs out of the discard prompt without losing the entry", async () => {
    const onClose = vi.fn();
    await renderWithBudget(host(<TransactionModal open onClose={onClose} />));
    fill("120", "Groceries");

    pressBack();
    // The prompt is above the sheet, so this back answers the prompt.
    expect(pressBack()).toBe(false);
    expect(screen.queryByText("Discard this entry?")).toBeNull();
    expect(amountField().value).toBe("120");
    expect(onClose).not.toHaveBeenCalled();

    // And the form is still what back is aimed at: asking a question instead
    // of closing must not hand the next press to the router.
    expect(pressBack()).toBe(false);
    expect(screen.getByText("Discard this entry?")).toBeTruthy();
  });

  describe("with the keypad up", () => {
    useTouchDevice();

    it("takes the keypad down before the form", async () => {
      const onClose = vi.fn();
      await renderWithBudget(host(<TransactionModal open onClose={onClose} />));

      // The amount field autofocuses, which on a touch device presents the pad.
      expect(screen.getByLabelText("Amount keypad")).toBeTruthy();

      expect(pressBack()).toBe(false);
      expect(screen.queryByLabelText("Amount keypad")).toBeNull();
      expect(onClose).not.toHaveBeenCalled();

      expect(pressBack()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });
  });
});

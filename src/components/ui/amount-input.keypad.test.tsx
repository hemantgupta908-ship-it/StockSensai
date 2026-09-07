// @vitest-environment jsdom

/**
 * When the keypad is allowed to go away.
 *
 * Directly beneath the pad's `Done` key sits the host sheet's footer button —
 * "Add Transaction" on a new entry, the delete on an edit. Closing the pad
 * during pointer-down left the browser to deliver the click of that same tap to
 * whatever had taken Done's place, so one tap on Done saved the transaction.
 *
 * jsdom does no hit-testing, so it cannot reproduce the delivery itself. What
 * it can pin is the contract that makes it impossible: a key that removes the
 * pad must not act until `click`, by which point the pad has already consumed
 * that tap.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { AmountInput } from "./amount-input";

/** Report a coarse pointer, which is what puts the app's own keypad on screen. */
function useTouchDevice() {
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
}

function Host({ onFooter }: { onFooter?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div>
      <AmountInput value={value} onChange={setValue} keypadLabel="Amount" autoFocus />
      {/* Stands in for the sheet's footer button, which the pad covers. */}
      <button type="button" onClick={onFooter}>
        Add Transaction
      </button>
    </div>
  );
}

const done = () => screen.getByRole("button", { name: /done/i });
const padIsOpen = () => screen.queryByRole("group", { name: "Amount keypad" }) !== null;

beforeEach(useTouchDevice);
afterEach(cleanup);

describe("amount keypad dismissal", () => {
  it("opens itself on a touch device rather than waiting for the OS keyboard", () => {
    render(<Host />);
    expect(padIsOpen()).toBe(true);
  });

  it("does not close on Done's pointer-down", () => {
    // The regression. Closing here is what handed the tap to the button below.
    render(<Host />);
    fireEvent.pointerDown(done());
    expect(padIsOpen()).toBe(true);
  });

  it("closes on Done's click", () => {
    render(<Host />);
    fireEvent.pointerDown(done());
    fireEvent.click(done());
    expect(padIsOpen()).toBe(false);
  });

  it("leaves the footer button alone throughout", () => {
    const onFooter = vi.fn();
    render(<Host onFooter={onFooter} />);
    fireEvent.pointerDown(done());
    fireEvent.click(done());
    expect(onFooter).not.toHaveBeenCalled();
  });

  it("still enters digits on pointer-down, so typing stays immediate", () => {
    render(<Host />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "7" }));
    expect(padIsOpen()).toBe(true);
    expect(screen.getByDisplayValue("7")).toBeDefined();
  });

  it("dismisses from the backdrop on click, not on pointer-down", () => {
    render(<Host />);
    const backdrop = screen.getByRole("button", { name: "Close keypad" });
    fireEvent.pointerDown(backdrop);
    expect(padIsOpen()).toBe(true);
    fireEvent.click(backdrop);
    expect(padIsOpen()).toBe(false);
  });
});

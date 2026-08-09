/**
 * Arithmetic in an amount field: "886.38-878", "1200/3", "450+2*99".
 *
 * A hand-written recursive-descent parser rather than `eval` or `new Function`:
 * the input is user text that gets persisted and re-read, so it must never be
 * executable. This grammar can only ever produce a number.
 *
 * grammar:
 *   expr   = term (("+" | "-") term)*
 *   term   = unary (("*" | "/" | "x" | "×" | "÷") unary)*
 *   unary  = ("-" | "+")? factor
 *   factor = number | "(" expr ")"
 */

/** True when the text is more than a plain number — i.e. worth showing a preview. */
export function isExpression(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  return !/^-?\d*\.?\d*$/.test(trimmed);
}

/**
 * Evaluate an amount expression. Returns null when the text is not a complete,
 * valid expression — an in-progress "886.38-" is not an error, just not ready.
 */
export function evaluateExpression(input: string): number | null {
  const src = input.replace(/[\s,]/g, "");
  if (!src) return null;

  let pos = 0;

  function peek(): string | undefined {
    return src[pos];
  }

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      const op = peek();
      if (op !== "+" && op !== "-") break;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseUnary();
    if (left === null) return null;
    for (;;) {
      const op = peek();
      if (op !== "*" && op !== "/" && op !== "x" && op !== "X" && op !== "×" && op !== "÷") break;
      pos++;
      const right = parseUnary();
      if (right === null) return null;
      // Division by zero yields Infinity, which is not a usable amount.
      if ((op === "/" || op === "÷") && right === 0) return null;
      left = op === "*" || op === "x" || op === "X" || op === "×" ? left * right : left / right;
    }
    return left;
  }

  function parseUnary(): number | null {
    const op = peek();
    if (op === "-" || op === "+") {
      pos++;
      const value = parseUnary();
      if (value === null) return null;
      return op === "-" ? -value : value;
    }
    return parseFactor();
  }

  function parseFactor(): number | null {
    if (peek() === "(") {
      pos++;
      const value = parseExpr();
      if (value === null) return null;
      if (peek() !== ")") return null;
      pos++;
      return value;
    }
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos])) pos++;
    if (pos === start) return null;
    const text = src.slice(start, pos);
    // Reject "1.2.3" — Number() would too, but be explicit about why.
    if ((text.match(/\./g) ?? []).length > 1) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  const result = parseExpr();
  // Trailing junk means the whole string was not consumed, so it is not valid.
  if (result === null || pos !== src.length) return null;
  if (!Number.isFinite(result)) return null;
  
  // Strip floating-point noise (e.g. 0.1 + 0.2 -> 0.30000000000000004)
  return Math.round(result * 1_000_000) / 1_000_000;
}

/**
 * What an amount field should treat as its numeric value: the evaluated
 * expression, or NaN when the text cannot be resolved.
 */
export function amountValue(input: string): number {
  const value = evaluateExpression(input);
  return value === null ? NaN : value;
}

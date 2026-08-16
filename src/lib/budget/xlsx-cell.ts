/**
 * Flattening ExcelJS cells.
 *
 * Unlike a plain sheet reader, ExcelJS preserves cell *structure*: a formula
 * cell arrives as `{ formula, result }`, styled text as `{ richText: [...] }`,
 * a linked cell as `{ text, hyperlink }`, and a broken one as `{ error }`.
 *
 * Left alone these stringify to `[object Object]`, which then parses to `NaN`
 * and silently imports a bank statement full of zero-rupee rows — wrong in the
 * worst way, because it looks like it worked. Everything that reads an uploaded
 * sheet goes through here.
 */

/** A cell reduced to something the import mapping can use directly. */
export type CellValue = string | number | Date | null;

export function cellValue(cell: unknown): CellValue {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell;
  if (typeof cell === "number" || typeof cell === "string") return cell;
  if (typeof cell === "boolean") return String(cell);

  if (typeof cell === "object") {
    const obj = cell as Record<string, unknown>;

    // Rich text: concatenate the runs back into the string the user sees.
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part) => String((part as { text?: unknown }).text ?? "")).join("");
    }
    // A formula cell is only useful for what it evaluated to.
    if ("result" in obj) return cellValue(obj.result);
    // Hyperlink cells carry their label in `text`.
    if ("text" in obj) return cellValue(obj.text);
    // `#REF!` and friends are not data.
    if ("error" in obj) return null;
  }

  return String(cell);
}

/**
 * Turn an ExcelJS row's `values` into a dense, zero-indexed array.
 *
 * ExcelJS rows are 1-indexed and sparse — `values[0]` is always empty, and a
 * blank cell is a hole rather than a value — so column N is not at index N
 * until this has run.
 */
export function rowValues(values: unknown[]): CellValue[] {
  return Array.from(values).slice(1).map(cellValue);
}

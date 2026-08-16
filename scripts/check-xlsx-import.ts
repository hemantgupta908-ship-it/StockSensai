/**
 * Round-trip check for the spreadsheet import path.
 *
 * The old `xlsx` reader was swapped for ExcelJS, which hands back structured
 * cells rather than scalars. A type error would have been the lucky outcome —
 * the realistic failure is a sheet that parses "successfully" into rows of zero,
 * so this asserts on the values that come back out.
 */

import ExcelJS from "exceljs";

import { cellValue, rowValues } from "../src/lib/budget/xlsx-cell";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("\nspreadsheet import\n");

  // --- cell flattening, the part that silently corrupts amounts -----------
  check("plain number survives", cellValue(1234.5) === 1234.5);
  check("plain string survives", cellValue("Coffee") === "Coffee");
  check("empty cell is null", cellValue(null) === null && cellValue(undefined) === null);
  check(
    "rich text flattens to its visible string",
    cellValue({ richText: [{ text: "SWIGGY" }, { text: " INSTAMART" }] }) === "SWIGGY INSTAMART",
  );
  check("formula cell yields its result", cellValue({ formula: "A1*2", result: 500 }) === 500);
  check("hyperlink cell yields its label", cellValue({ text: "Receipt", hyperlink: "http://x" }) === "Receipt");
  check("error cell is null, not the string '#REF!'", cellValue({ error: "#REF!" }) === null);

  // The specific regression: an unflattened object stringifies to
  // "[object Object]", which parseFloat turns into a zero-rupee row.
  const rich = cellValue({ richText: [{ text: "450.25" }] });
  check(
    "a structured amount cell does not parse to zero",
    (parseFloat(String(rich).replace(/[^0-9.-]/g, "")) || 0) === 450.25,
  );

  // --- sparse, 1-indexed rows --------------------------------------------
  const sparse: unknown[] = [];
  sparse[1] = "01/08/2026";
  sparse[2] = "Rent";
  sparse[4] = 25000; // column 3 (Debit) left blank
  const dense = rowValues(sparse);
  check(
    "a blank middle column keeps later columns in position",
    dense[0] === "01/08/2026" && dense[1] === "Rent" && dense[3] === 25000,
    `got [${dense.join(", ")}]`,
  );

  // --- full write → read round trip ---------------------------------------
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Transactions");
  ws.addRow(["Date (DD/MM/YYYY)", "Description", "Debit", "Credit"]);
  ws.addRow(["01/08/2026", "Rent", 25000, ""]);
  ws.addRow(["02/08/2026", "Salary", "", 90000]);
  ws.addRow([new Date("2026-08-03T00:00:00Z"), "Groceries", 1450.75, ""]);

  const buffer = await wb.xlsx.writeBuffer();

  const read = new ExcelJS.Workbook();
  await read.xlsx.load(buffer as ArrayBuffer);
  const sheet = read.worksheets[0];

  check("the written sheet reads back", !!sheet);

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => rows.push(rowValues(row.values as unknown[])));

  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== null && c !== ""));
  check("three data rows survive the round trip", dataRows.length === 3, `got ${dataRows.length}`);

  // Reproduce the component's debit/credit mapping exactly.
  const amounts = dataRows.map((row) => {
    const debit = parseFloat(String(row[2]).replace(/[^0-9.-]/g, "")) || 0;
    const credit = parseFloat(String(row[3]).replace(/[^0-9.-]/g, "")) || 0;
    if (credit > 0) return credit;
    if (debit > 0) return -debit;
    return 0;
  });

  check(
    "debits become negative and credits positive",
    amounts[0] === -25000 && amounts[1] === 90000 && amounts[2] === -1450.75,
    `got [${amounts.join(", ")}]`,
  );

  check("no row imported as zero", amounts.every((a) => a !== 0), `got [${amounts.join(", ")}]`);

  // A genuine date cell must come back as a Date, not a serial number.
  check("a date-typed cell round-trips as a Date", dataRows[2][0] instanceof Date, `got ${typeof dataRows[2][0]}`);

  console.log(failures === 0 ? "\nall scenarios passed\n" : `\n${failures} scenario(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();

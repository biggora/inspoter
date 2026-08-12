// A CSV reader and writer sized to this one job. Contact exports are RFC 4180
// with the usual real-world wrinkles: fields holding newlines (notes), doubled
// quotes, a trailing blank line, and Excel's insistence on a UTF-8 BOM.

// Excel refuses to read UTF-8 CSV without it; every other reader skips it.
const UTF8_BOM = "\uFEFF";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(field);
    field = "";
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char !== '"') {
        field += char;
        continue;
      }
      if (text[index + 1] === '"') {
        field += '"';
        index += 1;
        continue;
      }
      inQuotes = false;
      continue;
    }

    if (char === '"' && field.length === 0 && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
      continue;
    }
    if (char === ",") {
      endField();
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      endRow();
      continue;
    }
    if (char === "\n") {
      endRow();
      continue;
    }
    field += char;
  }

  // A file ending in a newline must not produce a trailing empty row.
  if (field.length > 0 || row.length > 0) endRow();
  return rows.filter((entry) => entry.some((value) => value.length > 0));
}

function quoteField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

/**
 * Writes CRLF-terminated CSV with the BOM Excel needs to read UTF-8 — every
 * client this export targets (Excel, Google Sheets, Outlook) either wants it
 * or ignores it.
 */
export function writeCsv(rows: readonly (readonly string[])[]): string {
  return (
    UTF8_BOM +
    rows.map((row) => row.map(quoteField).join(",")).join("\r\n") +
    "\r\n"
  );
}

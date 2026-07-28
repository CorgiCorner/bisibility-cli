export type TableColumn<T> = {
  header: string;
  value: (item: T) => string | null | number | undefined;
};

function cell(value: string | null | number | undefined) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

export function renderJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function renderTable<T>(items: readonly T[], columns: readonly TableColumn<T>[]) {
  if (items.length === 0) {
    return "No rows found.\n";
  }

  const rows = items.map((item) => columns.map((column) => cell(column.value(item))));
  const widths = columns.map((column, index) =>
    Math.max(
      column.header.length,
      ...rows.map((row) => {
        const value = row[index] ?? "";
        return value.length;
      }),
    ),
  );
  const renderRow = (row: readonly string[]) =>
    row.map((value, index) => value.padEnd(widths[index] ?? 0)).join("  ");

  return `${renderRow(columns.map((column) => column.header))}\n${renderRow(
    widths.map((width) => "-".repeat(width)),
  )}\n${rows.map(renderRow).join("\n")}\n`;
}

export function renderKeyValues(items: readonly [string, string | number | null | undefined][]) {
  const width = Math.max(...items.map(([key]) => key.length));
  const lines = items.map(([key, value]) => `${key.padEnd(width)}  ${cell(value)}`);
  return `${lines.join("\n")}\n`;
}

export function csvEscape(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  let text: string;
  if (Array.isArray(value)) {
    text = value.join(";");
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else if (typeof value === "string") {
    text = value;
  } else if (typeof value === "symbol") {
    text = value.description ?? "";
  } else if (typeof value === "function") {
    text = value.name;
  } else if (typeof value === "boolean") {
    text = value ? "true" : "false";
  } else if (typeof value === "number" || typeof value === "bigint") {
    text = value.toString();
  } else {
    return "";
  }
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function renderCsv(rows: readonly Record<string, unknown>[], headers: readonly string[]) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

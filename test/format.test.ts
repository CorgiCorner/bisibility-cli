import { describe, expect, it } from "vitest";
import { csvEscape, renderCsv, renderKeyValues, renderTable } from "../src/format.js";

describe("format helpers", () => {
  it("renders empty and populated tables", () => {
    expect(renderTable([], [{ header: "id", value: () => "kw_a10000000000000000000000" }])).toBe(
      "No rows found.\n",
    );
    expect(
      renderTable(
        [{ id: "kw_a10000000000000000000000", text: "rank tracker" }],
        [
          { header: "id", value: (item) => item.id },
          { header: "keyword", value: (item) => item.text },
        ],
      ),
    ).toContain("kw_a10000000000000000000000  rank tracker");
  });

  it("renders key values with empty values as dashes", () => {
    expect(
      renderKeyValues([
        ["position", 4],
        ["url", null],
      ]),
    ).toContain("url       -");
  });

  it("escapes CSV values and renders CSV rows", () => {
    expect(csvEscape('one,"two"')).toBe('"one,""two"""');
    expect(csvEscape(["api", "seo"])).toBe("api;seo");
    expect(
      renderCsv([{ id: "kw_a10000000000000000000000", text: "rank, tracker" }], ["id", "text"]),
    ).toBe('id,text\nkw_a10000000000000000000000,"rank, tracker"\n');
  });
});

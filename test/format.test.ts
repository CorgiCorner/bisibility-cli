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

  it.each([
    [null, ""],
    [undefined, ""],
    [true, "true"],
    [false, "false"],
    [42, "42"],
    [42n, "42"],
    [Symbol("label"), "label"],
    [Symbol(), ""],
    [function namedColumn() {}, "namedColumn"],
    [{ value: "quoted" }, '"{""value"":""quoted""}"'],
    ["line\nbreak", '"line\nbreak"'],
  ])("preserves CSV scalar and structured values: %s", (input, expected) => {
    expect(csvEscape(input)).toBe(expected);
  });

  it("renders missing table cells without losing valid zero values", () => {
    const output = renderTable([null, undefined, "", 0], [{ header: "value", value: (v) => v }]);
    expect(
      output
        .split("\n")
        .slice(2, 6)
        .map((line) => line.trim()),
    ).toEqual(["-", "-", "-", "0"]);
  });
});

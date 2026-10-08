import { describe, expect, it } from "vitest";
import { assertPublicId, publicIdList } from "../src/public-id.js";

const keywordId = "kw_a10000000000000000000000";

describe("public ID parsers", () => {
  it("returns resource-specific public IDs after validation", () => {
    expect(assertPublicId(keywordId, "kw", "Keyword ID")).toBe(keywordId);
    expect(publicIdList([keywordId, "kw_b10000000000000000000000"], "kw", "Keyword ID")).toEqual([
      keywordId,
      "kw_b10000000000000000000000",
    ]);
  });

  it("rejects a non-canonical resource prefix", () => {
    expect(() => assertPublicId("rule_a10000000000000000000000", "alr", "Alert rule ID")).toThrow(
      "alr_ public ID",
    );
  });

  it("rejects malformed, mixed-case, and wrong-prefix values uniformly", () => {
    const malformedId = `c${"a".repeat(24)}`;

    expect(() => assertPublicId(malformedId, "kw", "Keyword ID")).toThrow("kw_ public ID");
    expect(() => assertPublicId("kw_A10000000000000000000000", "kw", "Keyword ID")).toThrow(
      "kw_ public ID",
    );
    expect(() => assertPublicId("prj_a10000000000000000000000", "kw", "Keyword ID")).toThrow(
      "kw_ public ID",
    );
  });
});

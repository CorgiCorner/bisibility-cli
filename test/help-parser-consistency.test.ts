import { describe, expect, it } from "vitest";
import * as help from "../src/help.js";
import { booleanFlags, valueFlags } from "../src/parser.js";

const parserOnly = new Set<string>([]);
const helpOnly = new Set<string>([]);

function allHelpText() {
  return Object.entries(help)
    .filter(([name, value]) => name !== "helpFor" && typeof value === "function")
    .map(([, value]) => (value as () => string)())
    .join("\n");
}

describe("help and parser flags", () => {
  it("keeps every documented flag parseable and every parser flag documented", () => {
    const documented = new Set(
      [...allHelpText().matchAll(/--([a-z][a-z0-9-]*)/g)].map((match) => match[1] as string),
    );
    const parsed = new Set([...booleanFlags, ...valueFlags]);

    expect([...documented].filter((flag) => !parsed.has(flag) && !helpOnly.has(flag))).toEqual([]);
    expect([...parsed].filter((flag) => !documented.has(flag) && !parserOnly.has(flag))).toEqual(
      [],
    );
  });
});

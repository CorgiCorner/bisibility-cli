import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = new URL("../src/", import.meta.url);
const approvedNamespaces = new Set([
  "account",
  "alertRules",
  "alerts",
  "analytics",
  "apiKeys",
  "backlinks",
  "competitors",
  "domainOverview",
  "imports",
  "keywords",
  "locations",
  "notificationSettings",
  "pricing",
  "projects",
  "providers",
  "rankChecks",
  "savedViews",
  "signals",
  "sitemapMonitors",
  "system",
  "team",
]);

async function sourceFiles(): Promise<Array<{ path: string; source: string }>> {
  const paths = await readdir(sourceRoot, { recursive: true });
  return Promise.all(
    paths
      .filter((path) => path.endsWith(".ts"))
      .map(async (path) => ({
        path: relative(process.cwd(), join(sourceRoot.pathname, path)),
        source: await readFile(new URL(path, sourceRoot), "utf8"),
      })),
  );
}

describe("SDK ownership boundary", () => {
  it("uses only approved resource namespaces", async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles()) {
      for (const match of file.source.matchAll(/\bclient\.([A-Za-z_$][\w$]*)/g)) {
        const namespace = match[1];
        if (namespace && !approvedNamespaces.has(namespace)) {
          violations.push(`${file.path}: client.${namespace}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not reintroduce local cursor pagination collectors", async () => {
    const forbidden = [
      /\bcollectPaginated\b/,
      /\bcollectKeywords\b/,
      /\bcollectRankChecks\b/,
      /\bwhile\s*\([^)]*cursor[^)]*\)/,
    ];
    const violations: string[] = [];
    for (const file of await sourceFiles()) {
      for (const pattern of forbidden) {
        if (pattern.test(file.source)) {
          violations.push(`${file.path}: ${pattern.source}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

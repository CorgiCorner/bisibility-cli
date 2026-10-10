import { describe, expect, it } from "vitest";
import {
  alertRuleInput,
  keywordFilters,
  paginationOptions,
  parseSignalPayload,
  providerCredentials,
  providerTestInput,
  yesNo,
} from "../src/context.js";
import { getStringFlag, getStringFlags, hasFlag, parseArgv } from "../src/parser.js";

describe("parseArgv", () => {
  it("parses positionals, long flags, aliases, and repeated values", () => {
    const args = parseArgv([
      "keywords",
      "add",
      "rank tracker",
      "-p",
      "prj_a10000000000000000000000",
      "--tag",
      "api",
      "--tag=launch",
      "--json",
    ]);

    expect(args.positionals).toEqual(["keywords", "add", "rank tracker"]);
    expect(getStringFlag(args, "project")).toBe("prj_a10000000000000000000000");
    expect(getStringFlags(args, "tag")).toEqual(["api", "launch"]);
    expect(hasFlag(args, "json")).toBe(true);
  });

  it("stops option parsing after a double dash", () => {
    const args = parseArgv(["keywords", "add", "--", "--not-a-flag"]);

    expect(args.positionals).toEqual(["keywords", "add", "--not-a-flag"]);
    expect(hasFlag(args, "not-a-flag")).toBe(false);
  });

  it("parses new command flags", () => {
    const args = parseArgv([
      "alerts",
      "create",
      "--channel",
      "email",
      "--channel=slack",
      "--disabled",
      "--target-id",
      "kw_a10000000000000000000000",
      "--config-json",
      "{}",
    ]);

    expect(getStringFlags(args, "channel")).toEqual(["email", "slack"]);
    expect(getStringFlag(args, "target-id")).toBe("kw_a10000000000000000000000");
    expect(getStringFlag(args, "config-json")).toBe("{}");
    expect(hasFlag(args, "disabled")).toBe(true);
  });

  it("parses ranked keyword and analytics flags", () => {
    const args = parseArgv([
      "keywords",
      "suggest-ranked",
      "--connection",
      "conn_a10000000000000000000000",
      "--offset",
      "100",
      "--fresh",
      "--all",
      "--start-date",
      "2026-07-01",
      "--end-date",
      "2026-07-31",
      "--path",
      "/pricing",
      "--query",
      "rank tracker",
    ]);

    expect(getStringFlag(args, "connection")).toBe("conn_a10000000000000000000000");
    expect(getStringFlag(args, "offset")).toBe("100");
    expect(getStringFlag(args, "path")).toBe("/pricing");
    expect(hasFlag(args, "fresh")).toBe(true);
    expect(hasFlag(args, "all")).toBe(true);
  });

  it("parses keyword research and metrics flags", () => {
    const research = parseArgv([
      "keywords",
      "research",
      "rank tracker",
      "--mode",
      "ideas",
      "--limit",
      "500",
      "--clickstream",
      "--estimate",
      "--max-cost",
      "7",
    ]);
    expect(getStringFlag(research, "mode")).toBe("ideas");
    expect(getStringFlag(research, "limit")).toBe("500");
    expect(hasFlag(research, "clickstream")).toBe(true);
    expect(hasFlag(research, "estimate")).toBe(true);
    expect(getStringFlag(research, "max-cost")).toBe("7");

    const metrics = parseArgv(["keywords", "metrics", "--keywords", "one,two", "--fresh"]);
    expect(getStringFlag(metrics, "keywords")).toBe("one,two");
    expect(hasFlag(metrics, "fresh")).toBe(true);
  });

  it("parses Domain Overview market and page flags", () => {
    const args = parseArgv([
      "domain-overview",
      "keywords",
      "example.com",
      "--location-code",
      "2840",
      "--language-code",
      "en",
      "--keyword-limit",
      "50",
      "--page-limit",
      "250",
    ]);

    expect(getStringFlag(args, "location-code")).toBe("2840");
    expect(getStringFlag(args, "language-code")).toBe("en");
    expect(getStringFlag(args, "keyword-limit")).toBe("50");
    expect(getStringFlag(args, "page-limit")).toBe("250");
  });

  it("parses rank history export flags", () => {
    const args = parseArgv([
      "export",
      "rank-history",
      "--range",
      "90",
      "--granularity",
      "weekly",
      "--keyword-id",
      "kw_a10000000000000000000000",
      "--keyword-ids",
      "kw_a20000000000000000000000,kw_a30000000000000000000000",
      "--out",
      "history.csv",
    ]);

    expect(getStringFlag(args, "range")).toBe("90");
    expect(getStringFlag(args, "granularity")).toBe("weekly");
    expect(getStringFlag(args, "keyword-id")).toBe("kw_a10000000000000000000000");
    expect(getStringFlag(args, "keyword-ids")).toBe(
      "kw_a20000000000000000000000,kw_a30000000000000000000000",
    );
    expect(getStringFlag(args, "out")).toBe("history.csv");
  });

  it("interprets explicit boolean values after `=` for boolean flags", () => {
    expect(hasFlag(parseArgv(["--fresh=false"]), "fresh")).toBe(false);
    expect(hasFlag(parseArgv(["--fresh=0"]), "fresh")).toBe(false);
    expect(hasFlag(parseArgv(["--fresh=no"]), "fresh")).toBe(false);
    expect(hasFlag(parseArgv(["--fresh=off"]), "fresh")).toBe(false);
    expect(hasFlag(parseArgv(["--fresh=true"]), "fresh")).toBe(true);
    expect(hasFlag(parseArgv(["--fresh=1"]), "fresh")).toBe(true);
    expect(hasFlag(parseArgv(["--fresh=yes"]), "fresh")).toBe(true);
    expect(hasFlag(parseArgv(["--fresh=on"]), "fresh")).toBe(true);
    expect(() => parseArgv(["--fresh=maybe"]).positionals).toThrow(
      "Option --fresh expects a boolean value",
    );
    const bareOff = parseArgv(["--fresh", "--fresh=false"]);
    expect(hasFlag(bareOff, "fresh")).toBe(false);
    const offThenOn = parseArgv(["--fresh=false", "--fresh"]);
    expect(hasFlag(offThenOn, "fresh")).toBe(true);
  });

  it("throws for missing values and unknown options", () => {
    expect(() => parseArgv(["--project"])).toThrow("Option --project requires a value.");
    expect(() => parseArgv(["-x"])).toThrow("Unknown short option -x.");
    expect(() => parseArgv(["--limt", "5"])).toThrow("Unknown long option --limt.");
    expect(() => parseArgv(["--limt=5"])).toThrow("Unknown long option --limt.");
  });

  it("keeps a lone dash positional", () => {
    expect(parseArgv(["keywords", "add", "-"]).positionals).toEqual(["keywords", "add", "-"]);
    expect(getStringFlag(parseArgv(["keywords", "add", "--file", "-"]), "file")).toBe("-");
  });

  it("preserves optional keyword filters and pagination cursors", () => {
    const args = parseArgv([
      "--country",
      "PL",
      "--intent",
      "commercial",
      "--search",
      "rank",
      "--sort",
      "position_desc",
      "--tag",
      "seo",
      "--topic",
      "visibility",
      "--cursor",
      "next-page",
    ]);
    expect(keywordFilters(args, 25)).toEqual({
      country: "PL",
      intent: "commercial",
      search: "rank",
      sort: "position_desc",
      tag: "seo",
      topic: "visibility",
      cursor: "next-page",
      limit: 25,
    });
    expect(paginationOptions(args)).toEqual({ cursor: "next-page", limit: 50 });
  });

  it("distinguishes omitted provider test credentials from explicit login data", () => {
    expect(providerTestInput(parseArgv([]))).toEqual({});
    expect(
      providerTestInput(
        parseArgv(["--login", "account", "--secret", "secret", "--credential", "region=eu"]),
      ),
    ).toEqual({
      credentials: { region: "eu" },
      login: "account",
      secret: "secret",
    });
    expect(() => providerCredentials(parseArgv(["--credential", " =value"]))).toThrow(
      "non-empty name",
    );
  });

  it("rejects oversized signal payloads by UTF-8 byte length", () => {
    expect(() => parseSignalPayload(JSON.stringify({ text: "é".repeat(4096) }))).toThrow("8KB");
    expect(parseSignalPayload('{"revision":"abc"}')).toEqual({ revision: "abc" });
    expect(yesNo(null)).toBeUndefined();
    expect(yesNo(false)).toBe("no");
  });

  it("preserves advanced alert conditions and validates required names and conditions", () => {
    expect(
      alertRuleInput(
        parseArgv([
          "--name",
          "Visibility",
          "--condition",
          "serp_feature_lost",
          "--target-type",
          "tag",
          "--target-id",
          "tag_a10000000000000000000000",
          "--top-n",
          "5",
          "--change-pct",
          "30",
          "--serp-feature",
          "featured_snippet",
          "--competitor-domain",
          "competitor.example.com",
          "--disabled",
        ]),
        "alerts create",
      ),
    ).toMatchObject({
      name: "Visibility",
      target_ids: ["tag_a10000000000000000000000"],
      top_n: 5,
      change_pct: 30,
      serp_feature: "featured_snippet",
      competitor_domain: "competitor.example.com",
      enabled: false,
    });
    expect(() =>
      alertRuleInput(parseArgv(["--condition", "position_drop"]), "alerts create"),
    ).toThrow("requires --name");
    expect(() => alertRuleInput(parseArgv(["--name", "Visibility"]), "alerts create")).toThrow(
      "requires --condition",
    );
  });
});

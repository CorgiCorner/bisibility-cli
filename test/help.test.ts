import { describe, expect, it } from "vitest";
import {
  alertsHelp,
  analyticsHelp,
  apiKeysHelp,
  authHelp,
  checkHelp,
  cloudImportHelp,
  competitorsHelp,
  configHelp,
  costHelp,
  exportHelp,
  helpFor,
  keywordsAddHelp,
  keywordsBulkHelp,
  keywordsDeleteHelp,
  keywordsGetHelp,
  keywordsHelp,
  keywordsListHelp,
  keywordsMetricsHelp,
  keywordsResearchHelp,
  keywordsSuggestRankedHelp,
  keywordsUpdateHelp,
  linkHelp,
  locationsHelp,
  mainHelp,
  notificationsHelp,
  projectsHelp,
  providersHelp,
  signalsHelp,
  sitemapsHelp,
  teamHelp,
  tokensHelp,
  viewsHelp,
} from "../src/help.js";

describe("help text", () => {
  it("prints command-specific help", () => {
    expect(mainHelp()).toContain("bisibility <command>");
    expect(mainHelp()).toContain("--cloud-url <url>");
    expect(mainHelp()).toContain("api-keys");
    expect(mainHelp()).toContain("projects");
    expect(mainHelp()).toContain("saved list|add|delete");
    expect(keywordsHelp()).toContain("keywords add");
    expect(keywordsHelp()).toContain("keywords bulk");
    expect(keywordsAddHelp()).toContain("--target-url");
    expect(keywordsAddHelp()).toContain("--location-key");
    expect(keywordsAddHelp()).toContain("NOT a city");
    expect(keywordsListHelp()).toContain("--all");
    expect(keywordsGetHelp()).toContain("keywords get <keyword-id>");
    expect(keywordsUpdateHelp()).toContain("--intent");
    expect(keywordsDeleteHelp()).toContain("keywords delete <keyword-id>");
    expect(keywordsBulkHelp()).toContain("set_frequency");
    expect(keywordsSuggestRankedHelp()).toContain("Paid lookup");
    expect(keywordsResearchHelp()).toContain("--estimate");
    expect(keywordsResearchHelp()).toContain("--max-cost <cents>");
    expect(keywordsResearchHelp()).toContain("write-scope");
    expect(keywordsMetricsHelp()).toContain("--estimate");
    expect(keywordsMetricsHelp()).toContain("--max-cost <cents>");
    expect(locationsHelp()).toContain("locations search");
    expect(analyticsHelp()).toContain("analytics sync");
    expect(checkHelp()).toContain("check <keyword-id>");
    expect(checkHelp()).toContain("--async");
    expect(checkHelp()).toContain("--status");
    expect(mainHelp()).toContain("signals create");
    expect(mainHelp()).toContain("cost estimate");
    expect(keywordsListHelp()).toContain("--intent");
    expect(keywordsListHelp()).toContain("--topic");
    expect(signalsHelp()).toContain("--source <api|cms|deploy>");
    expect(signalsHelp()).toContain("--happened-at");
    expect(signalsHelp()).toContain("search_engine_status");
    expect(costHelp()).toContain("cost provider-rates");
    expect(costHelp()).toContain("--keywords <count>");
    expect(providersHelp()).toContain("--endpoint");
    expect(projectsHelp()).toContain("projects defaults");
    expect(projectsHelp()).toContain("projects current");
    expect(projectsHelp()).toContain("projects use");
    expect(linkHelp()).toContain("bisibility link");
    expect(mainHelp()).toContain("link [project-id]");
    expect(apiKeysHelp()).toContain("api-keys create");
    expect(alertsHelp()).toContain("alerts triggered");
    expect(alertsHelp()).toContain("whole project team");
    expect(sitemapsHelp()).toContain("sitemaps enable");
    expect(teamHelp()).toContain("team invite");
    expect(providersHelp()).toContain("providers connect");
    expect(viewsHelp()).toContain("views create");
    expect(competitorsHelp()).toContain("competitors add");
    expect(notificationsHelp()).toContain("notifications prefs set");
    expect(tokensHelp()).toContain("tokens mint");
    expect(exportHelp()).toContain("--format <json|csv>");
    expect(exportHelp()).toContain("--history-limit <n>");
    expect(exportHelp()).toContain("export rank-history");
    expect(exportHelp()).toContain("checked_at timestamps");
    expect(cloudImportHelp()).toContain("cloud import <file>");
    expect(cloudImportHelp()).toContain("--json");
    expect(configHelp()).toContain("config set");
    expect(authHelp()).toContain("auth status");
    expect(authHelp()).toContain("https://bisibility.com/app/account/security");
  });

  it("routes help by command path", () => {
    expect(helpFor(["keywords", "add"])).toBe(keywordsAddHelp());
    expect(helpFor(["keywords", "list"])).toBe(keywordsListHelp());
    expect(helpFor(["keywords", "get"])).toBe(keywordsGetHelp());
    expect(helpFor(["keywords", "update"])).toBe(keywordsUpdateHelp());
    expect(helpFor(["keywords", "delete"])).toBe(keywordsDeleteHelp());
    expect(helpFor(["keywords", "bulk"])).toBe(keywordsBulkHelp());
    expect(helpFor(["keywords", "suggest-ranked"])).toBe(keywordsSuggestRankedHelp());
    expect(helpFor(["keywords"])).toBe(keywordsHelp());
    expect(helpFor(["check"])).toBe(checkHelp());
    expect(helpFor(["check", "list"])).toBe(checkHelp());
    expect(helpFor(["signals"])).toBe(signalsHelp());
    expect(helpFor(["signals", "create"])).toBe(signalsHelp());
    expect(helpFor(["cost"])).toBe(costHelp());
    expect(helpFor(["cost", "estimate"])).toBe(costHelp());
    expect(helpFor(["projects"])).toBe(projectsHelp());
    expect(helpFor(["projects", "defaults"])).toBe(projectsHelp());
    expect(helpFor(["link"])).toBe(linkHelp());
    expect(helpFor(["locations", "search"])).toBe(locationsHelp());
    expect(helpFor(["analytics", "sync"])).toBe(analyticsHelp());
    expect(helpFor(["unlink"])).toBe(linkHelp());
    expect(helpFor(["api-keys"])).toBe(apiKeysHelp());
    expect(helpFor(["alerts", "create"])).toBe(alertsHelp());
    expect(helpFor(["sitemaps", "list"])).toBe(sitemapsHelp());
    expect(helpFor(["team", "invite"])).toBe(teamHelp());
    expect(helpFor(["providers", "connect"])).toBe(providersHelp());
    expect(helpFor(["views", "create"])).toBe(viewsHelp());
    expect(helpFor(["competitors", "add"])).toBe(competitorsHelp());
    expect(helpFor(["notifications", "prefs"])).toBe(notificationsHelp());
    expect(helpFor(["tokens", "mint"])).toBe(tokensHelp());
    expect(helpFor(["export"])).toBe(exportHelp());
    expect(helpFor(["cloud"])).toBe(cloudImportHelp());
    expect(helpFor(["config"])).toBe(configHelp());
    expect(helpFor(["auth"])).toBe(authHelp());
    expect(helpFor(["missing"])).toBe(mainHelp());
  });

  it("documents reading project defaults without patch flags", () => {
    expect(projectsHelp()).toContain("With no defaults option, prints current project defaults.");
  });
});

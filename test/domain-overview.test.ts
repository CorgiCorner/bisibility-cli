import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";
import type { CliDeps } from "../src/index.js";

const sdk = vi.hoisted(() => {
  const client = {
    analyze: vi.fn(),
    history: vi.fn(),
    keywords: vi.fn(),
    pages: vi.fn(),
  };
  return { client };
});

vi.mock("@bisibility/sdk", () => {
  class BisibilityApiError extends Error {
    headers = new Headers();
    problem: { detail?: string } | undefined;
    status = 500;
  }
  return {
    BisibilityApiError,
    BisibilityClient: vi.fn(() => ({ domainOverview: sdk.client })),
  };
});

const PROJECT = "prj_a10000000000000000000000";
const commonArgs = [
  "--project",
  PROJECT,
  "--location-code",
  "2840",
  "--language-code",
  "en",
] as const;

function deps(): CliDeps {
  return {
    env: {
      BISIBILITY_API_KEY: "bsb_key_live_test_1234567890",
      BISIBILITY_BASE_URL: "https://api.test/api/v1",
    },
  };
}

function estimate(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      cached: false,
      estimate: true,
      estimated_cost_cents: 6,
      fresh_estimated_cost_cents: 10,
      history_estimated_cost_cents: 12,
      history_mode: "lazy",
      keyword_page_estimated_cost_cents: 2,
      language_code: "en",
      location_code: 2840,
      page_page_estimated_cost_cents: 3,
      provider: "dataforseo",
      scope: "root",
      target: "example.com",
      ...overrides,
    },
  };
}

function metrics(overrides: Record<string, unknown> = {}) {
  return {
    count: 1413.3,
    estimated_traffic_cost_cents: 14206.5,
    etv: 450.5,
    is_down: 131,
    is_lost: 360,
    is_new: 640,
    is_up: 153,
    pos1: 10,
    pos11_20: 40,
    pos21_30: 50,
    pos2_3: 20,
    pos31_40: 60,
    pos41_50: 70,
    pos4_10: 30,
    pos51_60: 80,
    pos61_70: 90,
    pos71_80: 100,
    pos81_90: 110,
    pos91_100: 120,
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      cached: false,
      cached_until: "2026-08-13T22:00:00.000Z",
      cost_cents: 6,
      fetched_at: "2026-08-13T10:00:00.000Z",
      history_mode: "lazy",
      keywords: {
        cached: false,
        cost_cents: 2,
        data: { cost_cents: 2, rows: [], total_count: 225 },
        fetched_at: "2026-08-13T10:00:00.000Z",
        ok: true,
      },
      language_code: "en",
      location_code: 2840,
      overview: metrics(),
      pages: {
        cached: false,
        cost_cents: 3,
        data: { cost_cents: 3, rows: [], total_count: 10 },
        fetched_at: "2026-08-13T10:00:00.000Z",
        ok: true,
      },
      previous_fetched_at: "2026-08-06T10:00:00.000Z",
      previous_overview: metrics({ count: 1200 }),
      previous_source_snapshot_at: "2026-08-06T00:00:00.000Z",
      provider: "dataforseo",
      scope: "root",
      source_snapshot_at: "2026-08-13T00:00:00.000Z",
      state: "ok",
      target: "example.com",
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("domain-overview CLI", () => {
  it("returns an estimate data object and maps market, scope, limits, and fresh", async () => {
    sdk.client.analyze.mockResolvedValueOnce(estimate());

    const result = await runCli(
      [
        "domain-overview",
        "analyze",
        "blog.example.com",
        ...commonArgs,
        "--scope",
        "subdomain",
        "--keyword-limit",
        "50",
        "--page-limit",
        "250",
        "--fresh",
        "--estimate",
        "--json",
      ],
      deps(),
    );

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(JSON.parse(result.stdout)).toMatchObject({ estimate: true, estimated_cost_cents: 6 });
    expect(sdk.client.analyze).toHaveBeenCalledWith(PROJECT, {
      estimateOnly: true,
      fresh: true,
      keywordLimit: 50,
      languageCode: "en",
      locationCode: 2840,
      pageLimit: 250,
      scopeOverride: "subdomain",
      target: "blog.example.com",
    });
  });

  it("stops after the estimate when a paid analyze has no explicit cap", async () => {
    sdk.client.analyze.mockResolvedValueOnce(estimate({ estimated_cost_cents: 5.612 }));

    const result = await runCli(
      ["domain-overview", "analyze", "example.com", ...commonArgs],
      deps(),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Estimated provider cost: $0.06");
    expect(result.stderr).toContain("--max-cost 6");
    expect(sdk.client.analyze).toHaveBeenCalledTimes(1);
  });

  it("uses the fresh estimate as an explicit cap gate and returns report JSON unchanged", async () => {
    sdk.client.analyze
      .mockResolvedValueOnce(estimate({ fresh_estimated_cost_cents: 10 }))
      .mockResolvedValueOnce(report({ cost_cents: 9 }));

    const result = await runCli(
      [
        "domain-overview",
        "analyze",
        "example.com",
        ...commonArgs,
        "--fresh",
        "--max-cost",
        "10",
        "--json",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Estimated provider cost: $0.10 (cap: 10 cents)");
    expect(result.stderr).toContain("Paid lookup: $0.09");
    expect(JSON.parse(result.stdout)).toMatchObject({ state: "ok", cost_cents: 9 });
    expect(sdk.client.analyze).toHaveBeenLastCalledWith(
      PROJECT,
      expect.objectContaining({ estimateOnly: false, fresh: true, maxCostCents: 10 }),
    );
  });

  it("turns a free estimate into a cache-only analyze with cap zero", async () => {
    sdk.client.analyze
      .mockResolvedValueOnce(estimate({ cached: true, estimated_cost_cents: 0 }))
      .mockResolvedValueOnce(report({ cached: true, cost_cents: 0 }));

    const result = await runCli(
      ["domain-overview", "analyze", "example.com", ...commonArgs],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("Estimated provider cost: $0.00 (cap: 0 cents).\n");
    expect(result.stdout).toContain("organic keywords");
    expect(sdk.client.analyze).toHaveBeenLastCalledWith(
      PROJECT,
      expect.objectContaining({ estimateOnly: false, maxCostCents: 0 }),
    );
  });

  it("renders human estimate and no-data module failures without losing their reasons", async () => {
    sdk.client.analyze
      .mockResolvedValueOnce(estimate({ cached: true, estimated_cost_cents: 0 }))
      .mockResolvedValueOnce(estimate({ estimated_cost_cents: 0 }))
      .mockResolvedValueOnce(
        report({
          cost_cents: 0,
          keywords: { cost_cents: 0, ok: false, reason: "lookup_failed" },
          overview: null,
          pages: { cost_cents: 0, ok: false, reason: "snapshot_expired" },
          state: "no_data",
        }),
      );

    const estimated = await runCli(
      ["domain-overview", "analyze", "example.com", ...commonArgs, "--estimate"],
      deps(),
    );
    const noData = await runCli(
      ["domain-overview", "analyze", "example.com", ...commonArgs],
      deps(),
    );

    expect(estimated.stdout).toContain("analysis estimate");
    expect(estimated.stdout).toContain("cached");
    expect(noData.stdout).toContain("lookup_failed (0 cents)");
    expect(noData.stdout).toContain("snapshot_expired (0 cents)");
    expect(noData.stdout).toContain("no_data");
  });

  it("loads history only after its estimate and exports flattened CSV rows", async () => {
    sdk.client.analyze.mockResolvedValueOnce(estimate({ history_estimated_cost_cents: 12 }));
    sdk.client.history.mockResolvedValueOnce({
      data: {
        cached: false,
        cost_cents: 12,
        data: [{ metrics: metrics(), month: 7, year: 2026 }],
        fetched_at: "2026-08-13T10:00:00.000Z",
      },
    });

    const result = await runCli(
      ["domain-overview", "history", "example.com", ...commonArgs, "--max-cost", "12", "--csv"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("month,year,count");
    expect(result.stdout).toContain("7,2026,1413.3");
    expect(sdk.client.history).toHaveBeenCalledWith(
      PROJECT,
      expect.objectContaining({ maxCostCents: 12, target: "example.com" }),
    );
  });

  it("renders human history and stable CSV headers for empty row results", async () => {
    sdk.client.analyze
      .mockResolvedValueOnce(estimate({ history_estimated_cost_cents: 0 }))
      .mockResolvedValueOnce(estimate({ keyword_page_estimated_cost_cents: 0 }))
      .mockResolvedValueOnce(estimate({ page_page_estimated_cost_cents: 0 }));
    sdk.client.history.mockResolvedValueOnce({
      data: {
        cached: true,
        cost_cents: 0,
        data: [{ metrics: metrics(), month: 7, year: 2026 }],
        fetched_at: "2026-08-13T10:00:00.000Z",
      },
    });
    sdk.client.keywords.mockResolvedValueOnce({
      data: {
        cached: true,
        cost_cents: 0,
        data: { cost_cents: 0, rows: [], total_count: 0 },
        fetched_at: "2026-08-13T10:00:00.000Z",
      },
    });
    sdk.client.pages.mockResolvedValueOnce({
      data: {
        cached: true,
        cost_cents: 0,
        data: { cost_cents: 0, rows: [], total_count: 0 },
        fetched_at: "2026-08-13T10:00:00.000Z",
      },
    });

    const history = await runCli(
      ["domain-overview", "history", "example.com", ...commonArgs],
      deps(),
    );
    const keywords = await runCli(
      ["domain-overview", "keywords", "example.com", ...commonArgs, "--csv"],
      deps(),
    );
    const pages = await runCli(
      ["domain-overview", "pages", "example.com", ...commonArgs, "--csv"],
      deps(),
    );

    expect(history.stdout).toContain("Period");
    expect(history.stdout).toContain("2026-07");
    expect(keywords.stdout).toBe(
      "keyword,position,search_volume,estimated_traffic,cpc_cents,difficulty,intent,ranking_url,serp_features,rank_absolute_delta,rank_absolute\n",
    );
    expect(pages.stdout).toBe(
      "path,keyword_count,etv,etv_delta_pct,top_keyword,top_keyword_position\n",
    );
  });

  it("renders the named keyword table for human output", async () => {
    sdk.client.analyze.mockResolvedValueOnce(estimate({ keyword_page_estimated_cost_cents: 0 }));
    sdk.client.keywords.mockResolvedValueOnce({
      data: {
        cached: true,
        cost_cents: 0,
        data: {
          cost_cents: 0,
          rows: [
            {
              cpc_cents: 125,
              difficulty: 43,
              estimated_traffic: 61.2,
              intent: "commercial",
              keyword: "rank tracker",
              position: 4,
              rank_absolute: 5,
              rank_absolute_delta: 2,
              ranking_url: "https://example.com/rank-tracker",
              search_volume: 720,
              serp_features: [],
            },
          ],
          total_count: null,
        },
        fetched_at: "2026-08-13T10:00:00.000Z",
      },
    });

    const result = await runCli(
      ["domain-overview", "keywords", "example.com", ...commonArgs],
      deps(),
    );

    expect(result.stdout).toContain("SERP delta");
    expect(result.stdout).toContain("rank tracker");
    expect(result.stdout).toContain("unknown total");
  });

  it("maps keyword and page paging and preserves their JSON data objects", async () => {
    sdk.client.analyze
      .mockResolvedValueOnce(estimate({ keyword_page_estimated_cost_cents: 2 }))
      .mockResolvedValueOnce(estimate({ page_page_estimated_cost_cents: 3 }));
    sdk.client.keywords.mockResolvedValueOnce({
      data: {
        cached: false,
        cost_cents: 2,
        data: {
          cost_cents: 2,
          rows: [
            {
              cpc_cents: 125,
              difficulty: 43,
              estimated_traffic: 61.2,
              intent: "commercial",
              keyword: "rank tracker",
              position: 4,
              rank_absolute: 5,
              rank_absolute_delta: 2,
              ranking_url: "https://example.com/rank-tracker",
              search_volume: 720,
              serp_features: ["featured_snippet"],
            },
          ],
          total_count: 225,
        },
        fetched_at: "2026-08-13T10:00:00.000Z",
      },
    });
    sdk.client.pages.mockResolvedValueOnce({
      data: {
        cached: false,
        cost_cents: 3,
        data: {
          cost_cents: 3,
          rows: [
            {
              etv: 120,
              etv_delta_pct: 6.4,
              keyword_count: 20,
              path: "/pricing",
              top_keyword: "rank tracker pricing",
              top_keyword_position: 3,
            },
          ],
          total_count: 10,
        },
        fetched_at: "2026-08-13T10:00:00.000Z",
      },
    });

    const keywords = await runCli(
      [
        "domain-overview",
        "keywords",
        "example.com",
        ...commonArgs,
        "--limit",
        "50",
        "--offset",
        "100",
        "--max-cost",
        "2",
        "--json",
      ],
      deps(),
    );
    const pages = await runCli(
      [
        "domain-overview",
        "pages",
        "example.com",
        ...commonArgs,
        "--limit",
        "250",
        "--offset",
        "0",
        "--max-cost",
        "3",
      ],
      deps(),
    );

    expect(JSON.parse(keywords.stdout)).toMatchObject({ data: { total_count: 225 } });
    expect(pages.stdout).toContain("/pricing");
    expect(sdk.client.keywords).toHaveBeenCalledWith(
      PROJECT,
      expect.objectContaining({ limit: 50, maxCostCents: 2, offset: 100 }),
    );
    expect(sdk.client.pages).toHaveBeenCalledWith(
      PROJECT,
      expect.objectContaining({ limit: 250, maxCostCents: 3, offset: 0 }),
    );
  });

  it("rejects invalid market, scope, limits, and output modes before spending", async () => {
    const missingMarket = await runCli(
      ["domain-overview", "analyze", "example.com", "--project", PROJECT],
      deps(),
    );
    expect(missingMarket.stderr).toContain("--language-code is required");

    const badScope = await runCli(
      ["domain-overview", "analyze", "example.com", ...commonArgs, "--scope", "site"],
      deps(),
    );
    expect(badScope.stderr).toContain("--scope must be root or subdomain");

    const badLimit = await runCli(
      ["domain-overview", "keywords", "example.com", ...commonArgs, "--limit", "101"],
      deps(),
    );
    expect(badLimit.stderr).toContain("--limit must be an integer from 1 through 100");

    const badOutput = await runCli(
      ["domain-overview", "history", "example.com", ...commonArgs, "--json", "--csv"],
      deps(),
    );
    expect(badOutput.stderr).toContain("Pass only one of --csv or --json");
  });

  it("allows an explicit zero cap to attempt a cache-only lookup after a positive estimate", async () => {
    sdk.client.analyze
      .mockResolvedValueOnce(estimate({ estimated_cost_cents: 6 }))
      .mockResolvedValueOnce(report({ cached: true, cost_cents: 0 }));

    const result = await runCli(
      ["domain-overview", "analyze", "example.com", ...commonArgs, "--max-cost", "0", "--json"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("cap: 0 cents");
    expect(result.stderr).toContain("cost_limit_exceeded on a cache miss");
    expect(sdk.client.analyze).toHaveBeenLastCalledWith(
      PROJECT,
      expect.objectContaining({ estimateOnly: false, maxCostCents: 0 }),
    );
  });

  it("rejects empty, duplicate, and unknown command inputs", async () => {
    const empty = await runCli(["domain-overview", "analyze", " ", ...commonArgs], deps());
    const duplicate = await runCli(
      ["domain-overview", "analyze", "one.example", "two.example", ...commonArgs],
      deps(),
    );
    const unknown = await runCli(["domain-overview", "unknown"], deps());

    expect(empty.stderr).toContain("Pass a Domain Overview target");
    expect(duplicate.stderr).toContain("Pass exactly one Domain Overview target");
    expect(unknown.stderr).toContain("must be analyze, history, keywords, or pages");
    expect(sdk.client.analyze).not.toHaveBeenCalled();
  });

  it("rejects inherited object keys as unknown actions", async () => {
    for (const action of ["toString", "constructor", "hasOwnProperty"]) {
      const result = await runCli(["domain-overview", action], deps());

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("must be analyze, history, keywords, or pages");
    }
    expect(sdk.client.analyze).not.toHaveBeenCalled();
  });
});

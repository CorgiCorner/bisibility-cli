import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseImportPackage } from "../src/commands/cloud.js";
import { runCli } from "../src/index.js";

const PROJECT = "prj_a00000000000000000000000";
const CHECK = "check_a00000000000000000000000";
const KEYWORD = "kw_a00000000000000000000000";
const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/evidence-fields.json", import.meta.url), "utf8"),
);
const reports = JSON.parse(
  readFileSync(new URL("./fixtures/rank-history-report.json", import.meta.url), "utf8"),
);
const preferences = {
  ...fixtures.preferences,
  check_in_app: true,
  check_notification_setting: "important",
  check_notification_top_n: 10,
  check_notification_position_move: 5,
  provider_incident_in_app: false,
};
const evidence = {
  acceptance: "accepted",
  fulfillment: "partial",
  returned_depth: 20,
  accounting: null,
  result: "partial",
  cost: null,
  original_checked_at: "2026-10-20T12:00:00.000Z",
  recovery: { state: "pending", last_attempt_at: null, next_attempt_at: null, reason: null },
};
const check = {
  id: CHECK,
  keyword_id: KEYWORD,
  checked_at: "2026-10-20T12:00:00.000Z",
  status: "completed",
  position: null,
  previous_position: null,
  provider: "serpapi",
  ranking_url: null,
  run_id: null,
  run: null,
  cost_cents: null,
  attempts: null,
  error: null,
  error_code: null,
  observation_completeness: "unknown",
};

function transport(body: unknown) {
  const requests: { url: URL; method: string; body: unknown }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/capabilities"))
      return Response.json({ data: [], apiVersions: ["v1"] });
    requests.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Response.json(body);
  });
  vi.stubGlobal("fetch", fetch);
  return {
    requests,
    deps: {
      fetch,
      env: {
        BISIBILITY_API_KEY: "bsb_key_test_evidence_contract",
        BISIBILITY_BASE_URL: "https://example.com/api/v1",
      },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("notification preferences through the published SDK", () => {
  it.each([
    ["check-notification-setting", "all", "check_notification_setting", "all"],
    ["check-notification-setting", "important", "check_notification_setting", "important"],
    ["check-notification-setting", "none", "check_notification_setting", "none"],
    ["check-notification-top-n", "1", "check_notification_top_n", 1],
    ["check-notification-top-n", "100", "check_notification_top_n", 100],
    ["check-notification-position-move", "1", "check_notification_position_move", 1],
    ["check-notification-position-move", "100", "check_notification_position_move", 100],
    ["provider-incident-in-app", "true", "provider_incident_in_app", true],
    ["provider-incident-in-app", "false", "provider_incident_in_app", false],
  ])("sends --%s %s without adding defaults", async (flag, value, field, expected) => {
    const d = transport(preferences);
    const result = await runCli(
      ["notifications", "prefs", "set", "--project", PROJECT, `--${flag}`, value, "--json"],
      d.deps,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(d.requests).toEqual([
      {
        url: new URL(`https://example.com/api/v1/projects/${PROJECT}/notification-preferences`),
        method: "PATCH",
        body: { [field]: expected },
      },
    ]);
    expect(JSON.parse(result.stdout)).toEqual(preferences);
  });

  it.each([
    ["check-notification-setting", "future"],
    ["check-notification-setting", ""],
    ...["check-notification-top-n", "check-notification-position-move"].flatMap((flag) =>
      ["0", "101", "1.5", "NaN", ""].map((value) => [flag, value]),
    ),
    ["provider-incident-in-app", "maybe"],
  ])("rejects invalid --%s=%s before updating", async (flag, value) => {
    const d = transport(preferences);
    const result = await runCli(
      ["notifications", "prefs", "set", "--project", PROJECT, `--${flag}=${value}`],
      d.deps,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`--${flag} must be`);
    expect(d.requests).toEqual([]);
  });

  it("prints all new preference values and tolerates older responses", async () => {
    const d = transport(preferences);
    const result = await runCli(["notifications", "prefs", "--project", PROJECT], d.deps);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/check notification setting\s+important/);
    expect(result.stdout).toMatch(/check notification top n\s+10/);
    expect(result.stdout).toMatch(/check notification position move\s+5/);
    expect(result.stdout).toMatch(/provider incident in app\s+no/);
    const {
      check_notification_setting,
      check_notification_top_n,
      check_notification_position_move,
      provider_incident_in_app,
      ...legacyPreferences
    } = preferences;
    const legacy = transport(legacyPreferences);
    const old = await runCli(["notifications", "prefs", "--project", PROJECT], legacy.deps);
    expect(old.exitCode, old.stderr).toBe(0);
    expect(old.stdout).toMatch(/check notification setting\s+-/);
  });

  it("allows future response settings without accepting them as input", async () => {
    const body = { ...preferences, check_notification_setting: "future_setting" };
    const d = transport(body);
    const result = await runCli(["notifications", "prefs", "--project", PROJECT], d.deps);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("future_setting");
  });

  it("prints API warnings even when the deprecated flag was not supplied", async () => {
    const warnings = [
      {
        code: "future_warning",
        field: "check_notification_setting",
        message: "Review the summary policy.",
      },
    ];
    const d = transport({ ...preferences, warnings });
    const result = await runCli(
      [
        "notifications",
        "prefs",
        "set",
        "--project",
        PROJECT,
        "--check-notification-setting",
        "all",
        "--json",
      ],
      d.deps,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain(warnings[0]?.message);
    expect(result.stderr).not.toContain("is deprecated");
    expect(JSON.parse(result.stdout).warnings).toEqual(warnings);
  });

  it.each([false, true])(
    "keeps the deprecated flag and exposes API warnings (JSON: %s)",
    async (json) => {
      const warnings = [
        {
          code: "deprecated_field",
          field: "check_in_app",
          message:
            "check_in_app is read-only and ignored on writes. Use check_notification_setting instead.",
        },
      ];
      const body = { ...preferences, warnings };
      const d = transport(body);
      const result = await runCli(
        [
          "notifications",
          "prefs",
          "set",
          "--project",
          PROJECT,
          "--check-in-app",
          "false",
          "--check-notification-setting",
          "important",
          ...(json ? ["--json"] : []),
        ],
        d.deps,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(d.requests[0]?.body).toEqual({
        check_in_app: false,
        check_notification_setting: "important",
      });
      expect(result.stderr).toContain("--check-in-app is deprecated");
      expect(result.stderr).toContain(warnings[0]?.message);
      if (json) expect(JSON.parse(result.stdout)).toEqual(body);
    },
  );
});

describe("rank evidence through the published SDK", () => {
  it.each(["complete", "partial", "unresolved", "future_value"])(
    "shows %s completeness and evidence",
    async (completeness) => {
      const body = {
        ...check,
        result_completeness: completeness,
        returned_depth: 20,
        comparison_allowed: false,
        evidence_projection: evidence,
      };
      const d = transport(body);
      const result = await runCli(["check", "get", CHECK], d.deps);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(new RegExp(`result\\s+${completeness}`));
      expect(result.stdout).toMatch(/evidence\s+partial/);
      expect(result.stdout).toMatch(/depth\s+20/);
      const json = await runCli(["check", "get", CHECK, "--json"], d.deps);
      expect(JSON.parse(json.stdout)).toEqual(body);
    },
  );

  it.each([
    {},
    { evidence_projection: null, returned_depth: null },
    { evidence_projection: { ...evidence, result: null, recovery: null }, returned_depth: 0 },
  ])("preserves absent and nullable evidence: %j", async (fields) => {
    const body = { ...check, ...fields };
    const d = transport(body);
    const human = await runCli(["check", "get", CHECK], d.deps);
    expect(human.exitCode, human.stderr).toBe(0);
    expect(human.stdout).toMatch(/evidence\s+-/);
    if ("returned_depth" in fields && fields.returned_depth === 0)
      expect(human.stdout).toMatch(/depth\s+0/);
    const json = await runCli(["check", "get", CHECK, "--json"], d.deps);
    expect(JSON.parse(json.stdout)).toEqual(body);
  });

  it("shows completeness and evidence in check lists and synchronous runs", async () => {
    const body = { ...check, result_completeness: "partial", evidence_projection: evidence };
    const d = transport({ data: [body], meta: { next_cursor: null } });
    const listed = await runCli(["check", "list", KEYWORD], d.deps);
    expect(listed.exitCode, listed.stderr).toBe(0);
    expect(listed.stdout).toContain("completeness");
    expect(listed.stdout).toContain("evidence");
    expect(listed.stdout).toContain("partial");
    const run = transport(body);
    const result = await runCli(["check", KEYWORD], run.deps);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/result\s+partial/);
  });

  it.each([undefined, null, [{ ...evidence, check_id: CHECK }]])(
    "preserves run evidence projections: %j",
    async (projections) => {
      const { evidence_projections, ...run } = fixtures.run;
      const body = {
        ...run,
        ...(projections === undefined ? {} : { evidence_projections: projections }),
      };
      const d = transport(body);
      const result = await runCli(["runs", "get", body.id, "--project", PROJECT], d.deps);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(body);
    },
  );

  it.each(
    ["1", "2"].flatMap((version) =>
      [undefined, null, evidence].map((projection) => [version, projection] as const),
    ),
  )("preserves evidence in rank-history version %s (%j)", async (version, projection) => {
    const source = version === "1" ? fixtures.history : reports.observations;
    const body = {
      ...source,
      data: source.data.map((row: { evidence_projection?: unknown }) => {
        const { evidence_projection, ...record } = row;
        return {
          ...record,
          ...(projection === undefined ? {} : { evidence_projection: projection }),
        };
      }),
    };
    const d = transport(body);
    const result = await runCli(
      ["export", "rank-history", "--project", PROJECT, "--json", "--report-version", version],
      d.deps,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(body);
  });
});

describe("Cloud import SDK compatibility boundary", () => {
  it("preserves new and legacy preference keys when reading a migration package", () => {
    const preference = {
      check_notification_setting: "important",
      check_notification_top_n: 10,
      check_notification_position_move: 5,
      provider_incident_in_app: true,
      check_in_app: false,
    };
    const pkg = {
      version: 5,
      scope: "history",
      project_id: PROJECT,
      exported_at: "2026-10-20T12:00:00.000Z",
      keywords: [],
      competitors: [],
      saved_views: [],
      alert_rules: [],
      notification_preferences: [preference],
    };
    expect(
      parseImportPackage(JSON.stringify(pkg), "migration.json").notification_preferences,
    ).toEqual([preference]);
  });
});

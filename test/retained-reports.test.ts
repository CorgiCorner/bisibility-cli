import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const PROJECT = "prj_abcdefghijklmnopqrstuvwx";
const MONITOR = "lmn_abcdefghijklmnopqrstuvwx";
const RUN = "lmr_abcdefghijklmnopqrstuvwx";
const TARGET = "lmt_aaaaaaaaaaaaaaaaaaaaaaa0";
const defaults = JSON.parse(
  readFileSync(new URL("./fixtures/defaults-review.json", import.meta.url), "utf8"),
);
const retainedRun = {
  id: "rcr_aaaaaaaaaaaaaaaaaaaaaaaa",
  project_id: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  status: "blocked",
  outcome: null,
  terminal: false,
  polling_state: "blocked",
  trigger: "scheduled",
  counts_basis: "planned_or_unlaunched",
  counts: {
    requested: 1,
    total: 1,
    completed: 0,
    failed: 0,
    deferred: 0,
    skipped: 0,
    cancelled: 0,
  },
  keyword_count: 1,
  target_count: 1,
  planned_for: "2026-10-12T12:00:00.000Z",
  launched_at: null,
  started_at: null,
  finished_at: null,
  blocked_reason: "budget_exhausted",
  parent_run_id: null,
  cost_cents: null,
  usage: { actual: null, estimated: null, unit: "operations" },
  native_estimate: { provider_id: null, unit: null, quantity: null, unknown_targets: 1 },
};
const reports = JSON.parse(
  readFileSync(new URL("./fixtures/rank-history-report.json", import.meta.url), "utf8"),
);
const local = JSON.parse(
  readFileSync(new URL("./fixtures/local-monitor-transport.json", import.meta.url), "utf8"),
);

function deps(reply: (url: URL) => unknown) {
  const requests: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname.endsWith("/capabilities"))
      return new Response(JSON.stringify({ data: [], apiVersions: ["v1"] }), {
        headers: { "content-type": "application/json" },
      });
    requests.push(url);
    const body = reply(url);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      headers: { "content-type": typeof body === "string" ? "text/csv" : "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  return {
    requests,
    deps: {
      fetch,
      env: {
        BISIBILITY_API_KEY: "bsb_key_test_transport_fixture",
        BISIBILITY_BASE_URL: "https://example.com/api/v1",
      },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("retained reports through the SDK", () => {
  it("follows all report pages without losing quality or the original scope", async () => {
    const pages = reports.attempt_pages;
    let index = 0;
    const d = deps(() => pages[index++]);
    const result = await runCli(
      [
        "export",
        "rank-history",
        "--project",
        PROJECT,
        "--json",
        "--report-version",
        "2",
        "--stream",
        "attempts",
        "--all",
      ],
      d.deps,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.data).toEqual(pages.flatMap((page: { data: unknown[] }) => page.data));
    expect(data.meta.report).toEqual(pages[0].meta.report);
    expect(data.meta.next_cursor).toBeNull();
    expect(d.requests).toHaveLength(pages.length);
    expect(d.requests[1]?.searchParams.get("cursor")).toBe(pages[0].meta.next_cursor);
    expect(d.requests.every((url) => url.searchParams.get("version") === "2")).toBe(true);
  });
  it("rejects a repeated report cursor instead of looping", async () => {
    const d = deps(() => reports.attempt_pages[0]);
    const result = await runCli(
      ["export", "rank-history", "--project", PROJECT, "--json", "--report-version", "2", "--all"],
      d.deps,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("repeated cursor");
    expect(d.requests).toHaveLength(2);
  });
  it.each([
    ["history", [], "history"],
    ["results", [RUN], "result"],
    ["listings", [RUN, TARGET], "listings"],
    ["point-history", [RUN, TARGET], "point_history"],
    ["export", [RUN], "export_json"],
  ])("reads Local %s without POST or a launch", async (action, tail, key) => {
    const payload = local[key as string];
    const d = deps(() => payload);
    const result = await runCli(
      ["local", action as string, MONITOR, ...(tail as string[]), "--project", PROJECT],
      d.deps,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(payload);
    expect(d.requests).toHaveLength(1);
    expect(d.requests[0]?.pathname).toContain(`/projects/${PROJECT}/local-monitors/${MONITOR}`);
  });
  it("returns Local CSV intact", async () => {
    const d = deps(() => local.export_csv);
    const result = await runCli(
      ["local", "export", MONITOR, RUN, "--project", PROJECT, "--format", "csv"],
      d.deps,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe(local.export_csv);
    expect(d.requests[0]?.searchParams.get("format")).toBe("csv");
  });
  it("rejects Local history filters on results before requesting data", async () => {
    const d = deps(() => local.result);
    const result = await runCli(
      ["local", "results", MONITOR, RUN, "--project", PROJECT, "--cursor", "opaque"],
      d.deps,
    );
    expect(result.exitCode).toBe(1);
    expect(d.requests).toHaveLength(0);
  });
  it("reads a cancelled run without polling for a missing observation and writes the requested file", async () => {
    const payload = {
      ...retainedRun,
      project_id: PROJECT,
      status: "cancelled",
      outcome: "cancelled",
      terminal: true,
    };
    const d = deps(() => payload);
    const writeFile = vi.fn(async (..._args: unknown[]) => undefined);
    const result = await runCli(
      ["runs", "get", retainedRun.id, "--project", PROJECT, "--output", "synthetic-report.json"],
      { ...d.deps, writeFile },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(writeFile).toHaveBeenCalledWith("synthetic-report.json", expect.any(String), "utf8");
    expect(JSON.parse(String(writeFile.mock.calls[0]?.[1]))).toEqual(payload);
    expect(d.requests).toHaveLength(1);
  });
  it.each([false, true])("reads all run outcomes with json=%s", async (json) => {
    const d = deps(() => ({
      data: [{ ...retainedRun, project_id: PROJECT }],
      meta: { next_cursor: null },
    }));
    const result = await runCli(
      [
        "runs",
        "list",
        "--project",
        PROJECT,
        "--segment",
        "planned",
        "--status",
        "blocked",
        "--limit",
        "25",
        ...(json ? ["--json"] : []),
      ],
      d.deps,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("blocked");
    expect(d.requests[0]?.searchParams.get("segment")).toBe("planned");
  });
  it("follows retained run cursors using the SDK iterator", async () => {
    const d = deps((url) => ({
      data: [{ ...retainedRun, project_id: PROJECT }],
      meta: { next_cursor: url.searchParams.has("cursor") ? null : "opaque" },
    }));
    const result = await runCli(["runs", "list", "--project", PROJECT, "--json", "--all"], d.deps);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).data).toHaveLength(2);
    expect(d.requests).toHaveLength(2);
  });
  it.each([
    ["runs", "unknown"],
    ["runs", "list", "--segment", "unknown"],
    ["runs", "list", "--limit", "201"],
    ["local", "unknown", MONITOR],
    ["local", "export", MONITOR, RUN, "--format", "xml"],
    ["export", "rank-history", "--report-version", "9"],
    ["export", "rank-history", "--stream", "unsupported"],
    ["export", "rank-history", "--basis", "unsupported"],
    ["export", "rank-history", "--json", "--stream", "attempts"],
    ["export", "rank-history", "--all", "--report-version", "2"],
  ])("rejects invalid selection %s before data access", async (...args) => {
    const d = deps(() => local.result);
    const result = await runCli([...args, "--project", PROJECT], d.deps);
    expect(result.exitCode).not.toBe(0);
    expect(d.requests).toHaveLength(0);
  });
  it("previews defaults only when the server advertises the non-writing contract", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const request = new Request(String(input), init);
        requests.push(request);
        const body = request.url.endsWith("/capabilities")
          ? { data: [], apiVersions: ["v1"], features: { reviewed_project_defaults: "v1" } }
          : defaults.preview;
        return new Response(JSON.stringify(body));
      }),
    );
    const result = await runCli(
      ["projects", "defaults", defaults.project, "--frequency", "manual", "--preview"],
      {
        env: {
          BISIBILITY_API_KEY: "bsb_key_test_transport_fixture",
          BISIBILITY_BASE_URL: "https://example.com/api/v1",
        },
      },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(defaults.preview);
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
    expect(requests.at(-1)?.url).toContain("preview_only=true");
  });
  it("does not send a defaults PATCH to a legacy server with no preview support", async () => {
    const d = deps(() => defaults.saved);
    const result = await runCli(
      ["projects", "defaults", defaults.project, "--frequency", "manual", "--preview"],
      d.deps,
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("does not advertise");
    expect(d.requests).toHaveLength(0);
  });
  it.each([["--review-json", ""], ["--review-json="], ["--review-json"]])(
    "rejects an empty review request before HTTP %s",
    async (...flags) => {
      const d = deps(() => defaults.saved);
      const result = await runCli(
        ["projects", "defaults", defaults.project, "--frequency", "manual", ...flags],
        d.deps,
      );
      expect(result.exitCode).not.toBe(0);
      expect(d.requests).toHaveLength(0);
    },
  );
  it("submits explicit reviewed defaults using the SDK command identity", async () => {
    const review = {
      expected_source_hash: defaults.preview.expected_source_hash,
      expected_revision: defaults.preview.expected_revision,
      preview_token: defaults.preview.preview_token,
      idempotency_key: "synthetic-reviewed-key-123",
      confirmed: true,
    };
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const request = new Request(String(input), init);
        requests.push(request);
        return new Response(
          JSON.stringify(
            request.url.endsWith("/capabilities")
              ? { data: [], apiVersions: ["v1"], features: { reviewed_project_defaults: "v1" } }
              : defaults.saved,
          ),
        );
      }),
    );
    const result = await runCli(
      [
        "projects",
        "defaults",
        defaults.project,
        "--frequency",
        "manual",
        "--review-json",
        JSON.stringify(review),
      ],
      {
        env: {
          BISIBILITY_API_KEY: "bsb_key_test_transport_fixture",
          BISIBILITY_BASE_URL: "https://example.com/api/v1",
        },
      },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const command = requests.find((r) => r.method === "PATCH");
    expect(command?.headers.get("Idempotency-Key")).toBe(review.idempotency_key);
    expect(await command?.json()).toMatchObject({ review });
  });
});

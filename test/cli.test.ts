import { Buffer } from "node:buffer";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BisibilityApiError } from "@bisibility/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";
import type { CliDeps } from "../src/index.js";
import { PUBLIC_ID_PREFIXES } from "../src/public-id.js";

const sdk = vi.hoisted(() => {
  type ListPage = { data: unknown[]; meta: { next_cursor: string | null } };
  const iteratorFor = (list: ReturnType<typeof vi.fn>, optionsIndex: number) =>
    vi.fn(async function* (...args: unknown[]) {
      const initial = (args[optionsIndex] as Record<string, unknown> | undefined) ?? {};
      let cursor = initial.cursor as string | undefined;
      do {
        const callArgs = [...args];
        callArgs[optionsIndex] = { ...initial, ...(cursor ? { cursor } : {}) };
        const page = (await list(...callArgs)) as ListPage;
        yield* page.data;
        cursor = page.meta.next_cursor ?? undefined;
      } while (cursor);
    });
  const client = {
    addKeywords: vi.fn(),
    addCompetitor: vi.fn(),
    analyzeBacklinks: vi.fn(),
    bulkUpdateKeywords: vi.fn(),
    connectProvider: vi.fn(),
    createAlertRule: vi.fn(),
    createApiKey: vi.fn(),
    createMyToken: vi.fn(),
    createProject: vi.fn(),
    createProjectApiKey: vi.fn(),
    createSavedKeywords: vi.fn(),
    createSavedView: vi.fn(),
    createSignal: vi.fn(),
    createTeamInvite: vi.fn(),
    deleteAlertRule: vi.fn(),
    deleteKeyword: vi.fn(),
    deleteProject: vi.fn(),
    deleteSavedKeyword: vi.fn(),
    deleteSavedView: vi.fn(),
    deleteSavedViewById: vi.fn(),
    disableProvider: vi.fn(),
    disconnectProvider: vi.fn(),
    enableProvider: vi.fn(),
    exportRankHistory: vi.fn(),
    getCapabilities: vi.fn(),
    getCloudImportCompatibility: vi.fn(),
    getCostEstimate: vi.fn(),
    getKeyword: vi.fn(),
    getLlmsText: vi.fn(),
    getNotificationPreferences: vi.fn(),
    getOpenApi: vi.fn(),
    getProject: vi.fn(),
    getProjectDefaults: vi.fn(),
    getProviderRates: vi.fn(),
    getRankCheckResult: vi.fn(),
    getHealth: vi.fn(),
    getKeywordMetrics: vi.fn(),
    getMe: vi.fn(),
    importCloudExport: vi.fn(),
    listApiKeys: vi.fn(),
    listAlertRules: vi.fn(),
    listCompetitors: vi.fn(),
    listKeywords: vi.fn(),
    listMigrationTokens: vi.fn(),
    listMyTokens: vi.fn(),
    listProjectApiKeys: vi.fn(),
    listProviders: vi.fn(),
    listProjects: vi.fn(),
    listRankChecks: vi.fn(),
    listRankedKeywordSuggestions: vi.fn(),
    listSitemapMonitors: vi.fn(),
    listSavedKeywords: vi.fn(),
    listSavedViews: vi.fn(),
    listSearchPerformanceQueryStats: vi.fn(),
    listSignals: vi.fn(),
    listTeamInvites: vi.fn(),
    listTeamMembers: vi.fn(),
    listTrafficSnapshots: vi.fn(),
    listTriggeredAlerts: vi.fn(),
    loadMoreBacklinkRows: vi.fn(),
    markProjectAlertsRead: vi.fn(),
    matchProjectKeywords: vi.fn(),
    mintMigrationToken: vi.fn(),
    muteTriggeredAlert: vi.fn(),
    removeCompetitor: vi.fn(),
    removeCompetitorById: vi.fn(),
    removeTeamMember: vi.fn(),
    researchKeywords: vi.fn(),
    resendTeamInvite: vi.fn(),
    revokeApiKey: vi.fn(),
    revokeMyToken: vi.fn(),
    revokeMigrationToken: vi.fn(),
    revokeMigrationTokenById: vi.fn(),
    revokeTeamInvite: vi.fn(),
    revokeTeamInviteById: vi.fn(),
    runRankCheck: vi.fn(),
    searchLocations: vi.fn(),
    setPrimaryProvider: vi.fn(),
    setProviderPriority: vi.fn(),
    testProviderConnection: vi.fn(),
    syncProjectTraffic: vi.fn(),
    updateAlertRule: vi.fn(),
    updateKeyword: vi.fn(),
    updateMe: vi.fn(),
    updateNotificationPreferences: vi.fn(),
    updateProject: vi.fn(),
    updateProjectDefaults: vi.fn(),
    updateSitemapMonitor: vi.fn(),
    updateTeamMemberRole: vi.fn(),
  };
  const apiKeyList = vi.fn((options: Record<string, unknown> = {}) => {
    const { projectId, ...pagination } = options;
    return typeof projectId === "string"
      ? client.listProjectApiKeys(projectId, pagination)
      : client.listApiKeys(pagination);
  });
  const apiKeyIterate = vi.fn(async function* (options: Record<string, unknown> = {}) {
    const { projectId, ...pagination } = options;
    const list = typeof projectId === "string" ? client.listProjectApiKeys : client.listApiKeys;
    const args = typeof projectId === "string" ? [projectId, pagination] : [pagination];
    const optionsIndex = typeof projectId === "string" ? 1 : 0;
    yield* iteratorFor(list, optionsIndex)(...args);
  });
  Object.assign(client, {
    account: {
      get: client.getMe,
      update: client.updateMe,
      tokens: {
        list: client.listMyTokens,
        create: client.createMyToken,
        revoke: client.revokeMyToken,
      },
    },
    alertRules: {
      list: client.listAlertRules,
      iterate: iteratorFor(client.listAlertRules, 1),
      create: client.createAlertRule,
      update: client.updateAlertRule,
      delete: client.deleteAlertRule,
    },
    alerts: {
      list: client.listTriggeredAlerts,
      iterate: iteratorFor(client.listTriggeredAlerts, 1),
      mute: client.muteTriggeredAlert,
      markAllRead: ({ projectId }: { projectId: string }) =>
        client.markProjectAlertsRead(projectId),
    },
    analytics: {
      overview: {},
      traffic: { list: client.listTrafficSnapshots, sync: client.syncProjectTraffic },
      searchPerformance: { list: client.listSearchPerformanceQueryStats },
    },
    apiKeys: {
      list: apiKeyList,
      iterate: apiKeyIterate,
      create: (input: unknown, scope?: { projectId?: string }) =>
        scope?.projectId
          ? client.createProjectApiKey(scope.projectId, input)
          : client.createApiKey(input),
      revoke: client.revokeApiKey,
    },
    backlinks: {
      analyze: client.analyzeBacklinks,
      extendSnapshot: client.loadMoreBacklinkRows,
    },
    competitors: {
      list: client.listCompetitors,
      iterate: iteratorFor(client.listCompetitors, 1),
      add: client.addCompetitor,
      remove: (selector: string | { id: string; projectId?: string }) =>
        typeof selector === "string" || !selector.projectId
          ? client.removeCompetitorById(typeof selector === "string" ? selector : selector.id)
          : client.removeCompetitor(selector.projectId, selector.id),
    },
    imports: {
      runFromExport: client.importCloudExport,
      compatibility: { get: client.getCloudImportCompatibility },
      tokens: {
        list: client.listMigrationTokens,
        iterate: iteratorFor(client.listMigrationTokens, 1),
        create: client.mintMigrationToken,
        revoke: (selector: string | { id: string; projectId?: string }) =>
          typeof selector === "string" || !selector.projectId
            ? client.revokeMigrationTokenById(typeof selector === "string" ? selector : selector.id)
            : client.revokeMigrationToken(selector.projectId, selector.id),
      },
    },
    keywords: {
      list: client.listKeywords,
      iterate: iteratorFor(client.listKeywords, 1),
      add: client.addKeywords,
      get: client.getKeyword,
      update: client.updateKeyword,
      delete: client.deleteKeyword,
      bulkUpdate: client.bulkUpdateKeywords,
      match: client.matchProjectKeywords,
      research: client.researchKeywords,
      suggestions: { list: client.listRankedKeywordSuggestions },
      metrics: { get: client.getKeywordMetrics },
      saved: {
        list: client.listSavedKeywords,
        iterate: iteratorFor(client.listSavedKeywords, 1),
        create: client.createSavedKeywords,
        delete: client.deleteSavedKeyword,
      },
    },
    locations: { search: client.searchLocations },
    notificationSettings: {
      get: client.getNotificationPreferences,
      update: client.updateNotificationPreferences,
    },
    pricing: { estimate: client.getCostEstimate, getRates: client.getProviderRates },
    projects: {
      list: client.listProjects,
      create: client.createProject,
      get: client.getProject,
      update: client.updateProject,
      delete: client.deleteProject,
      getDefaults: client.getProjectDefaults,
      updateDefaults: client.updateProjectDefaults,
    },
    providers: {
      list: client.listProviders,
      iterate: iteratorFor(client.listProviders, 1),
      connect: client.connectProvider,
      test: client.testProviderConnection,
      setEnabled: (projectId: string, providerId: string, enabled: boolean) =>
        enabled
          ? client.enableProvider(projectId, providerId)
          : client.disableProvider(projectId, providerId),
      setPriority: client.setProviderPriority,
      setPrimary: client.setPrimaryProvider,
      disconnect: client.disconnectProvider,
    },
    rankChecks: {
      list: client.listRankChecks,
      iterate: iteratorFor(client.listRankChecks, 1),
      run: client.runRankCheck,
      getResult: client.getRankCheckResult,
      history: { export: client.exportRankHistory },
    },
    savedViews: {
      list: client.listSavedViews,
      iterate: iteratorFor(client.listSavedViews, 1),
      create: client.createSavedView,
      delete: (selector: string | { id: string; projectId?: string }) =>
        typeof selector === "string" || !selector.projectId
          ? client.deleteSavedViewById(typeof selector === "string" ? selector : selector.id)
          : client.deleteSavedView(selector.projectId, selector.id),
    },
    signals: {
      list: client.listSignals,
      iterate: iteratorFor(client.listSignals, 1),
      create: client.createSignal,
    },
    sitemapMonitors: {
      list: client.listSitemapMonitors,
      update: client.updateSitemapMonitor,
    },
    system: {
      getHealth: client.getHealth,
      getCapabilities: client.getCapabilities,
      getOpenApi: client.getOpenApi,
      getLlmsText: client.getLlmsText,
    },
    team: {
      members: {
        list: client.listTeamMembers,
        iterate: iteratorFor(client.listTeamMembers, 1),
        updateRole: client.updateTeamMemberRole,
        remove: client.removeTeamMember,
      },
      invites: {
        list: client.listTeamInvites,
        iterate: iteratorFor(client.listTeamInvites, 1),
        create: client.createTeamInvite,
        resend: client.resendTeamInvite,
        revoke: (selector: string | { id: string; projectId?: string }) =>
          typeof selector === "string" || !selector.projectId
            ? client.revokeTeamInviteById(typeof selector === "string" ? selector : selector.id)
            : client.revokeTeamInvite(selector.projectId, selector.id),
      },
    },
  });
  return {
    BisibilityClient: vi.fn(() => client),
    client,
  };
});

const oauth = vi.hoisted(() => ({ loginWithPkce: vi.fn() }));

vi.mock("../src/oauth.js", () => ({ loginWithPkce: oauth.loginWithPkce }));

vi.mock("@bisibility/sdk", () => {
  class BisibilityApiError extends Error {
    body: string | undefined;
    headers: Headers;
    method: string;
    problem: { detail?: string } | undefined;
    status: number;
    url: string;

    constructor(
      message: string,
      options: {
        body?: string;
        headers?: Headers;
        method?: string;
        problem?: { detail?: string };
        status?: number;
        url?: string;
      } = {},
    ) {
      super(message);
      this.name = "BisibilityApiError";
      this.body = options.body;
      this.headers = options.headers ?? new Headers();
      this.method = options.method ?? "GET";
      this.problem = options.problem;
      this.status = options.status ?? 500;
      this.url = options.url ?? "https://api.test/api/v1";
    }
  }

  return {
    BisibilityApiError,
    BisibilityClient: sdk.BisibilityClient,
  };
});

const apiKey = "bsb_key_live_test_1234567890";

function deps(extra: CliDeps = {}): CliDeps {
  return {
    env: {
      BISIBILITY_API_KEY: apiKey,
      BISIBILITY_BASE_URL: "https://api.test/api/v1",
      ...extra.env,
    },
    now: () => new Date("2026-06-28T10:00:00.000Z"),
    ...extra,
  };
}

function list<T>(data: T[], nextCursor: string | null = null) {
  return { data, meta: { next_cursor: nextCursor } };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    domain: "example.com",
    id: "prj_a10000000000000000000000",
    name: "Example",
    updated_at: "2026-01-02T00:00:00.000Z",
    write_mode: "active",
    ...overrides,
  };
}

function projectDefaults(overrides: Record<string, unknown> = {}) {
  return {
    city: null,
    country: "United States",
    cron_expression: null,
    device: "desktop",
    frequency: "daily",
    jitter_minutes: 5,
    last_checked_at: null,
    location_key: "us",
    next_check_at: "2026-01-07T00:00:00.000Z",
    project_id: "prj_a10000000000000000000000",
    serp_depth: 100,
    serp_stop_on_match: true,
    source: "derived",
    timezone: "UTC",
    updated_at: "2026-01-06T00:00:00.000Z",
    ...overrides,
  };
}

function apiKeyResource(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    id: "key_a10000000000000000000000",
    last_used_at: null,
    name: "CI key",
    prefix: "bsb_key_live_abcd",
    revoked_at: null,
    ...overrides,
  };
}

function keyword(overrides: Record<string, unknown> = {}) {
  return {
    country: "United States",
    created_at: "2026-01-03T00:00:00.000Z",
    device: "desktop",
    id: "kw_a10000000000000000000000",
    intent: null,
    latest_position: 4,
    location: "United States",
    previous_position: 8,
    project_id: "prj_a10000000000000000000000",
    ranking_url: "https://example.com/page",
    schedule: null,
    tags: ["api"],
    target_url: "https://example.com/page",
    text: "rank tracker",
    topic: null,
    updated_at: "2026-01-04T00:00:00.000Z",
    ...overrides,
  };
}

function rankCheck(overrides: Record<string, unknown> = {}) {
  return {
    attempts: null,
    checked_at: "2026-01-06T00:00:00.000Z",
    cost_cents: 1,
    error: null,
    id: "check_a10000000000000000000000",
    keyword_id: "kw_a10000000000000000000000",
    position: 4,
    previous_position: 8,
    provider: "dataforseo",
    ranking_url: "https://example.com/page",
    status: "completed",
    ...overrides,
  };
}

function rankedSuggestions(overrides: Record<string, unknown> = {}) {
  return {
    cached: false,
    connections: [
      { id: "conn_a10000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
    ],
    cost_cents: 2,
    fetched_at: "2026-07-22T10:00:00.000Z",
    offset: 0,
    rows: [
      {
        already_tracked: true,
        estimated_traffic: 61.2,
        keyword: "rank tracker api",
        position: 4,
        search_volume: 720,
      },
    ],
    total_count: 1,
    ...overrides,
  };
}

function keywordResearch(overrides: Record<string, unknown> = {}) {
  return {
    cached: false,
    connections: [
      { id: "conn_a10000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
    ],
    cost_cents: 3,
    fetched_at: "2026-07-22T10:00:00.000Z",
    provider: "DataForSEO",
    rows: [
      {
        already_tracked: true,
        competition: 0.72,
        cpc_cents: 125,
        difficulty: 43,
        intent: "commercial",
        keyword: "rank tracker api",
        monthly_trend: [],
        search_volume: 720,
        source: "related",
      },
      {
        already_tracked: false,
        competition: null,
        cpc_cents: null,
        difficulty: null,
        intent: null,
        keyword: "seo position tool",
        monthly_trend: [],
        search_volume: null,
        source: "idea",
      },
    ],
    sources: [{ cached: false, cost_cents: 3, returned: 2, source: "related", status: "ok" }],
    total_count: 2,
    ...overrides,
  };
}

function backlinksSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      cached: false,
      cached_until: "2026-07-25T15:00:00.000Z",
      cost_cents: 5,
      fetched_at: "2026-07-24T15:00:00.000Z",
      fetched_row_count: 3,
      history: [],
      include_subdomains: true,
      provider: "dataforseo",
      rows: [
        {
          anchor: "example",
          domain_authority: 91,
          first_seen: "2026-01-21",
          flags: ["nofollow", "ugc"],
          links_count: 6,
          lost_at: null,
          source_domain: "reddit.com",
          source_url: "https://reddit.com/r/seo/1",
          spam_score: 2,
          status: "active",
          target_url: "https://example.com/",
        },
        {
          anchor: "",
          domain_authority: 88,
          first_seen: "2026-02-14",
          flags: [],
          links_count: 1,
          lost_at: null,
          source_domain: "reddit.com",
          source_url: "https://reddit.com/r/seo/2",
          spam_score: 3,
          status: "new",
          target_url: "https://example.com/pricing",
        },
        {
          anchor: "pricing",
          domain_authority: 40,
          first_seen: "2026-03-08",
          flags: ["sponsored"],
          links_count: 2,
          lost_at: "2026-07-01",
          source_domain: "blog.example",
          source_url: "https://blog.example/review",
          spam_score: 7,
          status: "lost",
          target_url: "https://example.com/pricing",
        },
      ],
      summary: {
        backlinks_total: 1685,
        broken_backlinks: 0,
        broken_pages: 0,
        dofollow_pct: 61,
        domain_rank: 37,
        lost_backlinks: 12,
        lost_referring_domains: 1,
        new_backlinks: 34,
        new_referring_domains: 3,
        referring_domains_total: 48,
        referring_pages: 1422,
        spam_score: 3,
      },
      target: "example.com",
      target_scope: "site",
      total_rows_available: 1685,
      ...overrides,
    },
  };
}

function keywordMetrics(overrides: Record<string, unknown> = {}) {
  return {
    cached_count: 0,
    connections: [
      { id: "conn_a10000000000000000000000", label: "DataForSEO", provider: "dataforseo" },
    ],
    cost_cents: 2,
    fetched_at: "2026-07-22T10:00:00.000Z",
    fetched_count: 2,
    provider: "DataForSEO",
    rows: [
      {
        competition: 0.55,
        cpc_cents: 99,
        difficulty: 38,
        intent: "informational",
        keyword: "rank tracker",
        monthly_trend: [],
        search_volume: 1000,
      },
      {
        competition: null,
        cpc_cents: null,
        difficulty: null,
        intent: null,
        keyword: "ads only market",
        monthly_trend: [],
        search_volume: 40,
      },
    ],
    total_count: 2,
    ...overrides,
  };
}

function keywordMatches(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        keyword_id: "kw_us_desktop",
        latest_position: 4,
        market: {
          country_code: "US",
          device: "desktop",
          location: "United States",
          location_key: "us",
        },
        matched_text: "rank tracker",
        previous_position: 8,
        text: "RANK TRACKER",
      },
      {
        keyword_id: "kw_pl_mobile",
        latest_position: null,
        market: {
          country_code: "PL",
          device: "mobile",
          location: "Poland",
          location_key: "pl",
        },
        matched_text: "rank tracker",
        previous_position: null,
        text: "RANK TRACKER",
      },
    ],
    meta: { truncated_texts: ["rank tracker"] },
    ...overrides,
  };
}

function alertRule(overrides: Record<string, unknown> = {}) {
  return {
    channels: ["email"],
    condition_type: "threshold",
    enabled: true,
    id: "alr_a10000000000000000000000",
    name: "Top 10 drop",
    target_type: "keyword",
    threshold_position: 10,
    ...overrides,
  };
}

function triggeredAlert(overrides: Record<string, unknown> = {}) {
  return {
    action: "Review the latest rank check.",
    ctas: ["Open keyword"],
    current: "12",
    headline: "Keyword left top 10",
    id: "al_a10000000000000000000000",
    keyword: "rank tracker",
    previous: "8",
    rule: "Top 10 drop",
    severity: "warning",
    unread: true,
    when: "just now",
    ...overrides,
  };
}

function sitemapMonitor(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    id: "prj_a10000000000000000000000",
    latest_snapshot: {
      fetched_at: "2026-07-22T08:00:00.000Z",
      sitemap_url: "https://example.com/sitemap.xml",
      url_count: 42,
    },
    project_id: "prj_a10000000000000000000000",
    sitemap_url: "https://example.com/sitemap.xml",
    status: "active",
    ...overrides,
  };
}

function teamMember(overrides: Record<string, unknown> = {}) {
  return {
    color: "blue",
    email: "owner@example.com",
    id: "mbr_a10000000000000000000000",
    initials: "OE",
    name: "Owner Example",
    role: "Owner",
    role_value: "owner",
    ...overrides,
  };
}

function teamInvite(overrides: Record<string, unknown> = {}) {
  return {
    email: "new@example.com",
    expires_label: "expires in 7 days",
    id: "inv_a10000000000000000000000",
    invited_label: "invited just now",
    role: "Viewer",
    role_value: "viewer",
    ...overrides,
  };
}

function provider(overrides: Record<string, unknown> = {}) {
  return {
    category_id: "serp",
    category_title: "SERP providers",
    description: "SERP provider",
    drawer: {
      activities: [],
      cost_help: "Direct billing",
      credential_fields: [],
      defaults: {
        cost_per_check: 1,
        depth: "100",
        device: "desktop",
        language: "en",
        location: "United States",
        login: "",
        primary: false,
        secret: "",
      },
      env_hint: "",
      primary_toggle_label: "Set primary",
    },
    enabled: false,
    icon: "database",
    id: "dataforseo",
    meta: [],
    name: "DataForSEO",
    primary: false,
    priority: 10,
    status: "ready",
    tint: "blue",
    ...overrides,
  };
}

function providerConnection(overrides: Record<string, unknown> = {}) {
  return {
    cost_per_check_cents: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    enabled: true,
    id: "conn_a10000000000000000000000",
    is_primary: false,
    kind: "serp",
    last_used_at: null,
    priority: 10,
    project_id: "prj_a10000000000000000000000",
    provider: "dataforseo",
    status: "connected",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function savedView(overrides: Record<string, unknown> = {}) {
  return {
    config: { filters: {}, search: "" },
    created_at: "2026-01-01T00:00:00.000Z",
    created_by_id: "usr_a10000000000000000000000",
    id: "viw_a10000000000000000000000",
    name: "Top winners",
    ...overrides,
  };
}

function savedKeyword(overrides: Record<string, unknown> = {}) {
  return {
    cpc: 125,
    difficulty: 42,
    id: "svkw_a10000000000000000000000",
    intent: "commercial",
    location: "US",
    saved_at: "2026-01-01T00:00:00.000Z",
    source_seed: "seo tools",
    text: "rank tracker",
    trend: [],
    variant_count: 3,
    volume: 1200,
    ...overrides,
  };
}

function competitor(overrides: Record<string, unknown> = {}) {
  return {
    domain: "competitor.com",
    id: "cmp_a10000000000000000000000",
    initials: "CO",
    label: "Competitor",
    ...overrides,
  };
}

function notificationPreferences(overrides: Record<string, unknown> = {}) {
  return {
    alert_email: true,
    alert_in_app: true,
    alert_slack: false,
    alert_webhook: false,
    check_email: true,
    check_in_app: true,
    email: "owner@example.com",
    email_verification: "verified",
    import_email: true,
    import_in_app: true,
    invite_email: true,
    invite_in_app: true,
    project_id: "prj_a10000000000000000000000",
    slack_available: false,
    webhook_available: false,
    ...overrides,
  };
}

function signal(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-07-01T12:00:05.000Z",
    happened_at: "2026-07-01T12:00:00.000Z",
    id: "sig_a10000000000000000000000",
    keyword_id: null,
    payload: null,
    project_id: "prj_a10000000000000000000000",
    public_id: "sig_pub100000000000000000000",
    severity: "info",
    source: "deploy",
    type: "deploy.completed",
    url: null,
    ...overrides,
  };
}

function costEstimate(overrides: Record<string, unknown> = {}) {
  return {
    checks_per_run: 1000,
    effective_cost_per_check_cents: 0.06,
    exceeds_largest_plan: false,
    exceeds_selected_plan: false,
    monthly_checks: 30000,
    monthly_cost_cents: 1800,
    monthly_cost_usd: 18,
    pricing_model: "flat",
    provider_id: "dataforseo",
    rate_checked_at: "2026-06-01",
    rate_source_url: "https://dataforseo.com/pricing",
    selected_option: {
      key: "standard",
      label: "Standard queue",
      short_label: "Standard",
      turnaround: "within minutes",
      unit_cost_cents: 0.06,
      unit_cost_usd: 0.0006,
    },
    ...overrides,
  };
}

function flatProviderRate(overrides: Record<string, unknown> = {}) {
  return {
    checked_at: "2026-06-01",
    label: "DataForSEO SERP API",
    options: [
      {
        key: "standard",
        label: "Standard queue",
        short_label: "Standard",
        turnaround: "within minutes",
        unit_cost_cents: 0.06,
        unit_cost_usd: 0.0006,
      },
    ],
    pricing_model: "flat",
    provider_id: "dataforseo",
    source_url: "https://dataforseo.com/pricing",
    ...overrides,
  };
}

function planProviderRate(overrides: Record<string, unknown> = {}) {
  return {
    checked_at: "2026-06-01",
    label: "SerpApi",
    plans: [
      {
        included_checks: 5000,
        label: "Developer",
        monthly_price_cents: 7500,
        monthly_price_usd: 75,
        plan_key: "developer",
      },
    ],
    pricing_model: "plan",
    provider_id: "serpapi",
    source_url: "https://serpapi.com/pricing",
    ...overrides,
  };
}

function migrationToken(overrides: Record<string, unknown> = {}) {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: { email: "owner@example.com", name: "Owner Example" },
    expires_at: "2026-01-08T00:00:00.000Z",
    id: "ferry_a10000000000000000000000",
    scope: "full",
    single_use: true,
    ...overrides,
  };
}

function issuedMigrationToken(overrides: Record<string, unknown> = {}) {
  return {
    ...migrationToken(),
    import_job: {
      counts: {},
      created_at: null,
      error: null,
      finished_at: null,
      id: null,
      progress: 0,
      started_at: null,
      state: "idle",
    },
    token: "mig_secret",
    ...overrides,
  };
}

beforeEach(() => {
  sdk.BisibilityClient.mockClear();
  for (const value of Object.values(sdk.client)) {
    if (vi.isMockFunction(value)) {
      value.mockReset();
    }
  }
  oauth.loginWithPkce.mockReset();
});

describe("help and top level parsing", () => {
  it("prints useful help and version output", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    await expect(runCli(["--version"], deps())).resolves.toMatchObject({
      stdout: `${pkg.version}\n`,
    });

    const help = await runCli(["keywords", "add", "--help"], deps());
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("bisibility keywords add <keyword...>");
    expect(help.stdout).toContain("--target-url <url>");

    const matchHelp = await runCli(["keywords", "match", "--help"], deps());
    expect(matchHelp.stdout).toContain("bisibility keywords match <text...>");
    expect(matchHelp.stdout).toContain("Up to 50 texts");
  });

  it("returns parse and command errors without throwing", async () => {
    await expect(runCli(["-x"], deps())).resolves.toMatchObject({
      exitCode: 2,
      stderr: "Unknown short option -x.\n",
    });
    await expect(runCli(["unknown"], deps())).resolves.toMatchObject({
      exitCode: 1,
      stderr: "Unknown command unknown.\n",
    });
  });
});

describe("public ID v3 boundary", () => {
  const projectId = "prj_a10000000000000000000000";
  const validUnknownKeywordId = "kw_z00000000000000000000000";

  it("uses the canonical global public ID prefix registry", () => {
    expect(PUBLIC_ID_PREFIXES).toEqual([
      "al",
      "alr",
      "audit",
      "check",
      "cmp",
      "conn",
      "dwh",
      "ferry",
      "imp",
      "inv",
      "key",
      "kw",
      "mbr",
      "ntf",
      "pat",
      "prj",
      "sid",
      "sig",
      "svkw",
      "tag",
      "usr",
      "viw",
      "we",
    ]);
  });

  it("rejects wrong-prefix, short, mixed-case, and raw IDs before calling the API", async () => {
    const rawCuid = `c${"a".repeat(24)}`;
    const cases = [
      ["prj_a10000000000000000000000", "kw_ public ID"],
      ["kw_short", "kw_ public ID"],
      ["kw_A00000000000000000000000", "kw_ public ID"],
      [rawCuid, "Raw or legacy IDs"],
    ] as const;

    for (const [keywordId, message] of cases) {
      const result = await runCli(["keywords", "get", keywordId, "--project", projectId], deps());
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(message);
    }

    expect(sdk.client.getKeyword).not.toHaveBeenCalled();
  });

  it("passes an unknown but strict public ID v3 to the API", async () => {
    sdk.client.getKeyword.mockResolvedValueOnce(keyword({ id: validUnknownKeywordId }));

    const result = await runCli(
      ["keywords", "get", validUnknownKeywordId, "--project", projectId],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(sdk.client.getKeyword).toHaveBeenCalledWith(validUnknownKeywordId);
  });

  it("validates alert targets by target type before calling the API", async () => {
    const wrongTarget = await runCli(
      [
        "alerts",
        "create",
        "--project",
        projectId,
        "--name",
        "Wrong target",
        "--condition",
        "threshold",
        "--target-type",
        "tag",
        "--target-id",
        validUnknownKeywordId,
      ],
      deps(),
    );
    const wrongJsonTarget = await runCli(
      [
        "alerts",
        "create",
        "--project",
        projectId,
        "--input-json",
        JSON.stringify({
          condition_type: "threshold",
          name: "Wrong JSON target",
          target_ids: ["tag_a10000000000000000000000"],
          target_type: "keyword",
        }),
      ],
      deps(),
    );

    expect(wrongTarget.stderr).toContain("tag_ public ID");
    expect(wrongJsonTarget.stderr).toContain("kw_ public ID");
    expect(sdk.client.createAlertRule).not.toHaveBeenCalled();
  });

  it("accepts canonical location keys and rejects retired loc_ resource IDs", async () => {
    const rejected = await runCli(
      [
        "keywords",
        "add",
        "rank tracker",
        "--project",
        projectId,
        "--location-key",
        "loc_a10000000000000000000000",
      ],
      deps(),
    );

    expect(rejected.stderr).toContain("canonical location_key");
    expect(sdk.client.addKeywords).not.toHaveBeenCalled();
  });

  it("rejects raw keyword IDs in a bulk JSON body before calling the API", async () => {
    const result = await runCli(
      [
        "keywords",
        "bulk",
        "--input-json",
        JSON.stringify({ keyword_ids: ["kw_short"], operation: "delete" }),
      ],
      deps(),
    );

    expect(result.stderr).toContain("kw_ public ID");
    expect(sdk.client.bulkUpdateKeywords).not.toHaveBeenCalled();
  });
});

describe("config commands", () => {
  it("writes, reads, unsets, and prints the config path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const config = join(dir, "config.json");
    const localDeps = deps({ env: {}, homeDir: dir });

    const set = await runCli(["config", "set", "apiKey", apiKey, "--config", config], localDeps);
    expect(set.stdout).toContain("Saved apiKey");

    const stored = JSON.parse(await readFile(config, "utf8")) as Record<string, unknown>;
    expect(stored.apiKey).toBe(apiKey);

    const get = await runCli(["config", "get", "--config", config], localDeps);
    expect(JSON.parse(get.stdout)).toMatchObject({
      apiKey: "bsb_key_...7890",
      baseUrl: "https://eu.bisibility.com/api/v1",
    });

    const unset = await runCli(["config", "unset", "apiKey", "--config", config], localDeps);
    expect(unset.stdout).toContain("Removed apiKey");
    expect(JSON.parse(await readFile(config, "utf8")).apiKey).toBeUndefined();

    const path = await runCli(["config", "path", "--config", config], localDeps);
    expect(path.stdout).toBe(`${config}\n`);
  });

  it("rejects unknown config keys", async () => {
    const result = await runCli(["config", "set", "bad", "value"], deps({ env: {} }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Config key must be");
  });

  it.each([
    {
      args: ["projects", "list"],
      credential: "bsp_live_old",
      expectedRecovery: "Replace or unset BISIBILITY_API_KEY, then run 'bisibility auth login'.",
      expectedSource: "BISIBILITY_API_KEY",
      prefix: "bsp_",
    },
    {
      args: ["projects", "list", "--api-key", "bsk_live_old"],
      credential: undefined,
      expectedRecovery:
        "Remove --api-key and run 'bisibility auth login', or pass a supported credential.",
      expectedSource: "--api-key",
      prefix: "bsk_",
    },
  ])(
    "identifies an invalid API credential from $expectedSource without exposing it",
    async ({ args, credential, expectedRecovery, expectedSource, prefix }) => {
      const result = await runCli(
        args,
        deps({ env: credential ? { BISIBILITY_API_KEY: credential } : {} }),
      );

      expect(result).toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining(
          `Invalid API credential from ${expectedSource}: unsupported prefix "${prefix}".`,
        ),
      });
      expect(result.stderr).toContain(expectedRecovery);
      expect(result.stderr).not.toContain("bsp_live_old");
      expect(result.stderr).not.toContain("bsk_live_old");
      expect(sdk.client.listProjects).not.toHaveBeenCalled();
    },
  );

  it("identifies an invalid API credential from the config file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-invalid-config-key-"));
    const config = join(dir, "config.json");
    await writeFile(config, JSON.stringify({ apiKey: "bsp_live_old" }));

    const result = await runCli(
      ["projects", "list", "--config", config],
      deps({ env: {}, homeDir: dir }),
    );

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining(
        `Invalid API credential from config file "${config}": unsupported prefix "bsp_".`,
      ),
    });
    expect(result.stderr).toContain("Run 'bisibility auth login' to replace it.");
    expect(result.stderr).not.toContain("bsp_live_old");
    expect(sdk.client.listProjects).not.toHaveBeenCalled();
  });

  it("rejects an invalid credential passed to config set without exposing it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-invalid-config-value-"));
    const config = join(dir, "config.json");

    const result = await runCli(
      ["config", "set", "apiKey", "invalidcredential", "--config", config],
      deps({ env: {}, homeDir: dir }),
    );

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining(
        "Invalid API credential passed to 'bisibility config set apiKey': unsupported format.",
      ),
    });
    expect(result.stderr).toContain("Run 'bisibility auth login', or pass a supported credential.");
    expect(result.stderr).not.toContain("invalidcredential");
    await expect(readFile(config, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("keywords commands", () => {
  it("adds keywords through the SDK and resolves the default project", async () => {
    sdk.client.listProjects.mockResolvedValueOnce(list([project()]));
    sdk.client.addKeywords.mockResolvedValueOnce({
      created: 2,
      results: [
        { keyword: keyword({ id: "kw_a10000000000000000000000" }), status: "created" },
        {
          keyword: keyword({ id: "kw_a20000000000000000000000", text: "seo monitor" }),
          status: "created",
        },
      ],
      skipped: 0,
    });

    const result = await runCli(
      [
        "keywords",
        "add",
        "rank tracker",
        "seo monitor",
        "--device",
        "mobile",
        "--country",
        "Poland",
        "--target-url",
        "https://example.com",
        "--tag",
        "api",
        "--tags",
        "launch,seo",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("created  2");
    expect(sdk.BisibilityClient).toHaveBeenCalledWith({
      apiKey,
      baseUrl: "https://api.test/api/v1",
    });
    expect(sdk.client.addKeywords).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      keywords: [
        {
          country: "Poland",
          device: "mobile",
          keyword: "rank tracker",
          tags: ["api", "launch", "seo"],
          target_url: "https://example.com",
        },
        {
          country: "Poland",
          device: "mobile",
          keyword: "seo monitor",
          tags: ["api", "launch", "seo"],
          target_url: "https://example.com",
        },
      ],
    });
  });

  it("refuses to guess when multiple projects are available", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-multiple-projects-"));
    sdk.client.listProjects.mockResolvedValueOnce(
      list([
        project({ id: "prj_one000000000000000000000", name: "One" }),
        project({ domain: "two.example", id: "prj_two000000000000000000000", name: "Two" }),
      ]),
    );

    const result = await runCli(["keywords", "list"], deps({ homeDir: dir }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Multiple projects are available");
    expect(sdk.client.listKeywords).not.toHaveBeenCalled();
  });

  it("adds keywords as JSON with location and validates add inputs", async () => {
    sdk.client.addKeywords.mockResolvedValueOnce({
      created: 1,
      results: [{ keyword: keyword(), status: "created" }],
      skipped: 0,
    });

    const json = await runCli(
      [
        "keywords",
        "add",
        "rank tracker",
        "--project",
        "prj_a10000000000000000000000",
        "--location",
        "Krakow",
        "--json",
      ],
      deps(),
    );
    expect(JSON.parse(json.stdout)).toMatchObject({ created: 1 });
    expect(sdk.client.addKeywords).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      keywords: [{ keyword: "rank tracker", location: "Krakow" }],
    });

    const missing = await runCli(["keywords", "add"], deps());
    expect(missing.stderr).toContain("Pass at least one keyword");

    const invalidDevice = await runCli(
      [
        "keywords",
        "add",
        "rank tracker",
        "--project",
        "prj_a10000000000000000000000",
        "--device",
        "tablet",
      ],
      deps(),
    );
    expect(invalidDevice.stderr).toContain("--device must be desktop or mobile");
  });

  it("lists all keyword pages as JSON with filters", async () => {
    sdk.client.listKeywords
      .mockResolvedValueOnce(list([keyword({ id: "kw_a10000000000000000000000" })], "next_1"))
      .mockResolvedValueOnce(
        list([keyword({ id: "kw_a20000000000000000000000", text: "seo monitor" })]),
      );

    const result = await runCli(
      [
        "keywords",
        "list",
        "--project",
        "prj_configured00000000000000",
        "--all",
        "--limit",
        "100",
        "--search",
        "rank",
        "--tag",
        "api",
        "--json",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data).toHaveLength(2);
    expect(sdk.client.listKeywords).toHaveBeenNthCalledWith(1, "prj_configured00000000000000", {
      limit: 100,
      search: "rank",
      tag: "api",
    });
    expect(sdk.client.listKeywords).toHaveBeenNthCalledWith(2, "prj_configured00000000000000", {
      cursor: "next_1",
      limit: 100,
      search: "rank",
      tag: "api",
    });
  });

  it("renders ranked suggestions and reports paid lookup cost", async () => {
    sdk.client.listRankedKeywordSuggestions.mockResolvedValueOnce(rankedSuggestions());

    const result = await runCli(
      [
        "keywords",
        "suggest-ranked",
        "--project",
        "prj_a10000000000000000000000",
        "--connection",
        "conn_a10000000000000000000000",
        "--fresh",
      ],
      deps(),
    );

    expect(result.stdout).toContain("Keyword");
    expect(result.stdout).toContain("Est. traffic");
    expect(result.stdout).toContain("rank tracker api");
    expect(result.stdout).toContain("yes");
    expect(result.stdout).toContain("status      paid");
    expect(result.stderr).toBe(
      "Paid lookup: $0.02 charged to your DataForSEO account (cached for 12h).\n",
    );
    expect(sdk.client.listRankedKeywordSuggestions).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      {
        connectionId: "conn_a10000000000000000000000",
        fresh: true,
        limit: 100,
        offset: 0,
      },
    );
  });

  it("prints the ranked suggestion envelope as JSON", async () => {
    sdk.client.listRankedKeywordSuggestions.mockResolvedValueOnce(
      rankedSuggestions({ cached: true }),
    );

    const result = await runCli(
      [
        "keywords",
        "suggest-ranked",
        "--project",
        "prj_a10000000000000000000000",
        "--offset",
        "0",
        "--json",
      ],
      deps(),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ cached: true, cost_cents: 2 });
    expect(result.stderr).toBe("");
  });

  it("paginates ranked suggestions until an empty page and tracks running cost", async () => {
    sdk.client.listRankedKeywordSuggestions
      .mockResolvedValueOnce(rankedSuggestions({ total_count: 250 }))
      .mockResolvedValueOnce(
        rankedSuggestions({
          cached: true,
          offset: 100,
          rows: [
            {
              already_tracked: false,
              estimated_traffic: 5,
              keyword: "seo api",
              position: 9,
              search_volume: 100,
            },
          ],
          total_count: 250,
        }),
      )
      .mockResolvedValueOnce(
        rankedSuggestions({ cost_cents: 2, offset: 200, rows: [], total_count: 250 }),
      );

    const result = await runCli(
      [
        "keywords",
        "suggest-ranked",
        "--project",
        "prj_a10000000000000000000000",
        "--all",
        "--json",
      ],
      deps(),
    );

    expect(JSON.parse(result.stdout).rows).toHaveLength(2);
    expect(result.stderr).toContain("Running cost: $0.02 after 2 pages.");
    expect(result.stderr).toContain("Running cost: $0.04 after 3 pages.");
    expect(sdk.client.listRankedKeywordSuggestions).toHaveBeenNthCalledWith(
      3,
      "prj_a10000000000000000000000",
      expect.objectContaining({ offset: 200 }),
    );
  });

  it("researches one seed, renders nullable metrics and reports the actual paid cost", async () => {
    sdk.client.researchKeywords.mockResolvedValueOnce(keywordResearch());

    const result = await runCli(
      [
        "keywords",
        "research",
        "rank tracker",
        "--project",
        "prj_a10000000000000000000000",
        "--mode",
        "related",
        "--limit",
        "300",
        "--connection",
        "conn_a10000000000000000000000",
        "--clickstream",
        "--fresh",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Keyword");
    expect(result.stdout).toContain("Volume");
    expect(result.stdout).toContain("KD");
    expect(result.stdout).toContain("CPC");
    expect(result.stdout).toContain("Intent");
    expect(result.stdout).toContain("Source");
    expect(result.stdout).toContain("Tracked");
    expect(result.stdout).toContain("$1.25");
    expect(result.stdout).toContain("related");
    expect(result.stdout).toContain("yes");
    expect(result.stdout).toContain("seo position tool  -");
    expect(result.stdout).toContain("status      paid");
    expect(result.stderr).toBe(
      "Paid lookup: $0.03 charged to your DataForSEO account (cached for 12h).\n",
    );
    expect(sdk.client.researchKeywords).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      connectionId: "conn_a10000000000000000000000",
      estimateOnly: false,
      fresh: true,
      includeClickstream: true,
      mode: "related",
      resultLimit: 300,
      seed: "rank tracker",
    });
  });

  it("prints cached research JSON without a paid notice and validates seed options", async () => {
    sdk.client.researchKeywords.mockResolvedValueOnce(keywordResearch({ cached: true }));

    const result = await runCli(
      [
        "keywords",
        "research",
        "rank tracker",
        "--project",
        "prj_a10000000000000000000000",
        "--json",
      ],
      deps(),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ cached: true, total_count: 2 });
    expect(result.stderr).toBe("");
    expect(sdk.client.researchKeywords).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      estimateOnly: false,
      fresh: false,
      includeClickstream: false,
      mode: "auto",
      resultLimit: 100,
      seed: "rank tracker",
    });

    const missing = await runCli(["keywords", "research"], deps());
    expect(missing.stderr).toContain("Pass one seed keyword");
    const extra = await runCli(["keywords", "research", "one", "two"], deps());
    expect(extra.stderr).toContain("Pass exactly one seed keyword");
    const badMode = await runCli(["keywords", "research", "seed", "--mode", "broad"], deps());
    expect(badMode.stderr).toContain("--mode must be one of auto, related, suggestions, ideas");
    const badLimit = await runCli(["keywords", "research", "seed", "--limit", "200"], deps());
    expect(badLimit.stderr).toContain("--limit must be one of 100, 300, 500");
  });

  it("fetches keyword metrics from a deduplicated newline file and reports paid cost", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-metrics-"));
    const file = join(dir, "keywords.txt");
    await writeFile(file, "rank tracker\n# campaign\nAds Only Market\nRANK TRACKER\n\n");
    sdk.client.getKeywordMetrics.mockResolvedValueOnce(keywordMetrics());

    const result = await runCli(
      [
        "keywords",
        "metrics",
        "--project",
        "prj_a10000000000000000000000",
        "--file",
        file,
        "--connection",
        "conn_a10000000000000000000000",
        "--clickstream",
        "--fresh",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("rank tracker");
    expect(result.stdout).toContain("$0.99");
    expect(result.stdout).toContain("ads only market  40");
    expect(result.stdout).toContain("status      paid");
    expect(result.stderr).toBe(
      "Paid lookup: $0.02 charged to your DataForSEO account (cached for 12h).\n",
    );
    expect(sdk.client.getKeywordMetrics).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      connection_id: "conn_a10000000000000000000000",
      estimate_only: false,
      fresh: true,
      include_clickstream: true,
      keywords: ["rank tracker", "Ads Only Market"],
    });
  });

  it("prints cached keyword metrics JSON and validates input selection", async () => {
    sdk.client.getKeywordMetrics.mockResolvedValueOnce(
      keywordMetrics({ cached_count: 2, cost_cents: 0, fetched_count: 0 }),
    );

    const result = await runCli(
      [
        "keywords",
        "metrics",
        "--project",
        "prj_a10000000000000000000000",
        "--keywords",
        "one, two",
        "--json",
      ],
      deps(),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ cached_count: 2, fetched_count: 0 });
    expect(result.stderr).toBe("");
    expect(sdk.client.getKeywordMetrics).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      estimate_only: false,
      fresh: false,
      include_clickstream: false,
      keywords: ["one", "two"],
    });

    const missing = await runCli(["keywords", "metrics"], deps());
    expect(missing.stderr).toContain("Pass keywords with --keywords or --file");
    const conflict = await runCli(
      ["keywords", "metrics", "--keywords", "one", "--file", "keywords.txt"],
      deps(),
    );
    expect(conflict.stderr).toContain("Pass either --keywords or --file");
  });

  it("matches texts across markets, keeps stored text distinct, and marks unmatched and partial results", async () => {
    sdk.client.matchProjectKeywords.mockResolvedValueOnce(keywordMatches());

    const result = await runCli(
      [
        "keywords",
        "match",
        " Rank Tracker ",
        "untracked keyword",
        "--project",
        "prj_m10000000000000000000000",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Requested");
    expect(result.stdout).toContain("Stored text");
    expect(result.stdout).toContain("rank tracker");
    expect(result.stdout).toContain("RANK TRACKER");
    expect(result.stdout).toContain("United States");
    expect(result.stdout).toContain("Poland");
    expect(result.stdout).toContain("untracked keyword");
    expect(result.stdout).toContain("not tracked");
    expect(result.stdout).toContain("partial");
    expect(result.stdout).toContain("rank tracker");
    expect(sdk.client.matchProjectKeywords).toHaveBeenCalledWith("prj_m10000000000000000000000", {
      texts: ["Rank Tracker", "untracked keyword"],
    });
  });

  it("rejects keyword match batches above the endpoint limit without making a request", async () => {
    const texts = Array.from({ length: 51 }, (_, index) => `keyword ${index + 1}`);

    const result = await runCli(
      ["keywords", "match", ...texts, "--project", "prj_m10000000000000000000000"],
      deps(),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("at most 50 texts");
    expect(sdk.client.matchProjectKeywords).not.toHaveBeenCalled();
  });

  it("prints unmatched keyword match results in JSON and validates text lengths", async () => {
    sdk.client.matchProjectKeywords.mockResolvedValueOnce(
      keywordMatches({ data: [], meta: { truncated_texts: [] } }),
    );

    const json = await runCli(
      [
        "keywords",
        "match",
        "untracked keyword",
        "--project",
        "prj_m10000000000000000000000",
        "--json",
      ],
      deps(),
    );

    expect(JSON.parse(json.stdout).results).toEqual([
      { matched_text: "untracked keyword", matches: [], tracked: false, truncated: false },
    ]);

    const empty = await runCli(
      ["keywords", "match", "   ", "--project", "prj_m10000000000000000000000"],
      deps(),
    );
    expect(empty.stderr).toContain("1 to 180 characters");
    const tooLong = await runCli(
      ["keywords", "match", "x".repeat(181), "--project", "prj_m10000000000000000000000"],
      deps(),
    );
    expect(tooLong.stderr).toContain("1 to 180 characters");
  });

  it("maps API errors from keyword matching consistently", async () => {
    sdk.client.matchProjectKeywords.mockRejectedValueOnce(
      new BisibilityApiError("Project access denied.", {
        body: undefined,
        headers: new Headers(),
        method: "POST",
        problem: { detail: "Project access denied." },
        status: 403,
        url: "https://api.test/api/v1/projects/prj_m10000000000000000000000/keyword-matches",
      }),
    );

    const result = await runCli(
      ["keywords", "match", "rank tracker", "--project", "prj_m10000000000000000000000"],
      deps(),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("API error 403: Project access denied.\n");
  });

  it("prints a free research estimate envelope and passes the request cost limit", async () => {
    sdk.client.researchKeywords.mockResolvedValueOnce(
      keywordResearch({
        cost_cents: 6,
        estimate: true,
        rows: [],
        sources: [
          {
            cached: false,
            cost_cents: 6,
            returned: 0,
            source: "related",
            status: "ok",
          },
        ],
        total_count: 0,
      }),
    );

    const result = await runCli(
      [
        "keywords",
        "research",
        "rank tracker",
        "--project",
        "prj_a10000000000000000000000",
        "--estimate",
        "--max-cost",
        "7",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ cost_cents: 6, estimate: true, rows: [] });
    expect(result.stderr).toBe("");
    expect(sdk.client.researchKeywords).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      expect.objectContaining({ estimateOnly: true, maxCostCents: 7 }),
    );
  });

  it("renders partial research source diagnostics", async () => {
    sdk.client.researchKeywords.mockResolvedValueOnce(
      keywordResearch({
        cost_cents: 2,
        sources: [
          {
            cached: false,
            cost_cents: 2,
            returned: 1,
            source: "related",
            status: "ok",
          },
          {
            cached: false,
            cost_cents: 0,
            reason: "budget_exhausted",
            returned: 0,
            source: "suggestion",
            status: "failed",
          },
          {
            cached: false,
            cost_cents: 0,
            reason: "previous_source_failed",
            returned: 0,
            source: "idea",
            status: "skipped",
          },
        ],
      }),
    );

    const result = await runCli(
      ["keywords", "research", "rank tracker", "--project", "prj_a10000000000000000000000"],
      deps(),
    );

    expect(result.stdout).toContain("Source");
    expect(result.stdout).toContain("suggestion  failed");
    expect(result.stdout).toContain("budget_exhausted");
    expect(result.stdout).toContain("idea        skipped");
    expect(result.stdout).toContain("previous_source_failed");
  });

  it("prints a free metrics estimate and preserves hash-prefixed inline keywords", async () => {
    sdk.client.getKeywordMetrics
      .mockResolvedValueOnce(
        keywordMetrics({
          cost_cents: 0,
          estimate: true,
          estimated_cost_cents: 4,
          fetched_count: 0,
          fetched_count_estimate: 2,
          rows: [],
          total_count: 0,
        }),
      )
      .mockResolvedValueOnce(keywordMetrics({ cached_count: 2, cost_cents: 0, fetched_count: 0 }));

    const estimate = await runCli(
      [
        "keywords",
        "metrics",
        "--project",
        "prj_a10000000000000000000000",
        "--keywords",
        "one,two",
        "--estimate",
        "--max-cost",
        "5",
      ],
      deps(),
    );

    expect(estimate.exitCode).toBe(0);
    expect(JSON.parse(estimate.stdout)).toMatchObject({
      estimate: true,
      estimated_cost_cents: 4,
      fetched_count_estimate: 2,
    });
    expect(estimate.stderr).toBe("");
    expect(sdk.client.getKeywordMetrics).toHaveBeenNthCalledWith(
      1,
      "prj_a10000000000000000000000",
      expect.objectContaining({ estimate_only: true, max_cost_cents: 5 }),
    );

    await runCli(
      [
        "keywords",
        "metrics",
        "--project",
        "prj_a10000000000000000000000",
        "--keywords",
        "#1 seo tool,other",
      ],
      deps(),
    );
    expect(sdk.client.getKeywordMetrics).toHaveBeenNthCalledWith(
      2,
      "prj_a10000000000000000000000",
      expect.objectContaining({ keywords: ["#1 seo tool", "other"] }),
    );
  });

  it("rejects non-positive keyword lookup cost limits", async () => {
    const research = await runCli(
      [
        "keywords",
        "research",
        "seed",
        "--project",
        "prj_a10000000000000000000000",
        "--max-cost",
        "0",
      ],
      deps(),
    );
    expect(research.stderr).toContain("--max-cost must be a positive integer");

    const metrics = await runCli(
      [
        "keywords",
        "metrics",
        "--project",
        "prj_a10000000000000000000000",
        "--keywords",
        "one",
        "--max-cost",
        "1.5",
      ],
      deps(),
    );
    expect(metrics.stderr).toContain("--max-cost must be a positive integer");
  });

  it("filters keyword lists by intent and topic", async () => {
    sdk.client.listKeywords.mockResolvedValueOnce(list([keyword()]));

    const result = await runCli(
      [
        "keywords",
        "list",
        "--project",
        "prj_a10000000000000000000000",
        "--intent",
        "commercial",
        "--topic",
        "pricing",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(sdk.client.listKeywords).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      intent: "commercial",
      limit: 50,
      topic: "pricing",
    });
  });

  it("lists keywords as a table and validates device values", async () => {
    sdk.client.listKeywords.mockResolvedValueOnce(list([keyword()]));

    const table = await runCli(
      ["keywords", "list", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(table.stdout).toContain("kw_a10000000000000000000000  rank tracker");

    const invalid = await runCli(
      ["keywords", "list", "--project", "prj_a10000000000000000000000", "--device", "tablet"],
      deps(),
    );
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("--device must be desktop or mobile");
  });

  it("requires an API key for protected commands", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "bisibility-cli-no-key-"));
    const result = await runCli(["keywords", "list"], deps({ env: {}, homeDir }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Not logged in. Run 'bisibility auth login', or set BISIBILITY_API_KEY.",
    );
  });

  it("reports missing default projects and invalid keyword subcommands", async () => {
    sdk.client.listProjects.mockResolvedValueOnce(list([]));

    const missingProject = await runCli(["keywords", "list"], deps());
    expect(missingProject.stderr).toContain("No project was returned");

    const badSubcommand = await runCli(["keywords", "remove"], deps());
    expect(badSubcommand.stderr).toContain(
      "Keywords command must be add, list, get, update, delete, bulk, match, research, metrics, or suggest-ranked",
    );
  });

  it("passes city, location key, intent, and topic when adding keywords", async () => {
    sdk.client.addKeywords.mockResolvedValueOnce({
      created: 1,
      results: [{ keyword: keyword(), status: "created" }],
      skipped: 0,
    });

    const result = await runCli(
      [
        "keywords",
        "add",
        "rank tracker",
        "--project",
        "prj_a10000000000000000000000",
        "--location",
        "Poland",
        "--city",
        "Krakow",
        "--location-key",
        "pl-krakow",
        "--intent",
        "commercial",
        "--topic",
        "tracking",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(sdk.client.addKeywords).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      keywords: [
        {
          city: "Krakow",
          intent: "commercial",
          keyword: "rank tracker",
          location: "Poland",
          location_key: "pl-krakow",
          topic: "tracking",
        },
      ],
    });
  });

  it("gets, updates, and deletes a keyword", async () => {
    sdk.client.getKeyword.mockResolvedValueOnce(keyword({ intent: "commercial" }));
    sdk.client.updateKeyword.mockResolvedValueOnce(keyword({ text: "rank tracker api" }));
    sdk.client.deleteKeyword.mockResolvedValueOnce(keyword());

    const got = await runCli(["keywords", "get", "kw_a10000000000000000000000"], deps());
    expect(got.exitCode).toBe(0);
    expect(got.stdout).toContain("rank tracker");
    expect(got.stdout).toContain("commercial");
    expect(sdk.client.getKeyword).toHaveBeenCalledWith("kw_a10000000000000000000000");

    const updated = await runCli(
      [
        "keywords",
        "update",
        "kw_a10000000000000000000000",
        "--keyword",
        "rank tracker api",
        "--device",
        "mobile",
        "--city",
        "Krakow",
        "--location-key",
        "pl-krakow",
        "--intent",
        "commercial",
        "--topic",
        "tracking",
        "--frequency",
        "daily",
        "--target-url",
        "https://example.com/api",
        "--tags",
        "api,launch",
      ],
      deps(),
    );
    expect(updated.exitCode).toBe(0);
    expect(sdk.client.updateKeyword).toHaveBeenCalledWith("kw_a10000000000000000000000", {
      city: "Krakow",
      device: "mobile",
      frequency: "daily",
      intent: "commercial",
      keyword: "rank tracker api",
      location_key: "pl-krakow",
      tags: ["api", "launch"],
      target_url: "https://example.com/api",
      topic: "tracking",
    });

    const deleted = await runCli(["keywords", "delete", "kw_a10000000000000000000000"], deps());
    expect(deleted.stdout).toContain("deleted  kw_a10000000000000000000000");
    expect(sdk.client.deleteKeyword).toHaveBeenCalledWith("kw_a10000000000000000000000");
  });

  it("treats --location as the market country when updating", async () => {
    sdk.client.updateKeyword.mockResolvedValueOnce(keyword({ location: "Poland" }));

    await runCli(
      ["keywords", "update", "kw_a10000000000000000000000", "--location", "Poland", "--json"],
      deps(),
    );

    expect(sdk.client.updateKeyword).toHaveBeenCalledWith("kw_a10000000000000000000000", {
      location: "Poland",
    });
  });

  it("validates keyword get, update, and delete inputs", async () => {
    const missingGet = await runCli(["keywords", "get"], deps());
    expect(missingGet.stderr).toContain("Pass a keyword ID");

    const missingUpdateFlags = await runCli(
      ["keywords", "update", "kw_a10000000000000000000000"],
      deps(),
    );
    expect(missingUpdateFlags.stderr).toContain("Pass at least one keyword field flag");

    const badFrequency = await runCli(
      ["keywords", "update", "kw_a10000000000000000000000", "--frequency", "hourly"],
      deps(),
    );
    expect(badFrequency.stderr).toContain("--frequency must be one of");

    const missingDelete = await runCli(["keywords", "delete"], deps());
    expect(missingDelete.stderr).toContain("Pass a keyword ID");
  });
});

describe("backlinks commands", () => {
  it("maps analyze flags to SDK options and passes the JSON envelope through", async () => {
    sdk.client.analyzeBacklinks.mockResolvedValueOnce(
      backlinksSnapshot({ estimate: true, estimated_cost_cents: 8 }),
    );

    const result = await runCli(
      [
        "backlinks",
        "analyze",
        "https://example.com/pricing",
        "--project",
        "prj_a10000000000000000000000",
        "--page",
        "--no-subdomains",
        "--limit",
        "300",
        "--mode",
        "one-per-domain",
        "--estimate",
        "--fresh",
        "--max-cost",
        "7",
        "--json",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      data: { estimate: true, estimated_cost_cents: 8 },
    });
    expect(result.stderr).toBe("");
    expect(sdk.client.analyzeBacklinks).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      estimateOnly: true,
      fresh: true,
      includeSubdomains: false,
      maxCostCents: 7,
      mode: "one_per_domain",
      resultLimit: 300,
      target: "https://example.com/pricing",
      targetScope: "page",
    });
  });

  it("renders links and reports cost only for an uncached paid analyze run", async () => {
    sdk.client.analyzeBacklinks
      .mockResolvedValueOnce(backlinksSnapshot())
      .mockResolvedValueOnce(backlinksSnapshot({ cached: true, cost_cents: 0 }));

    const paid = await runCli(
      ["backlinks", "analyze", "example.com", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    const cached = await runCli(
      [
        "backlinks",
        "analyze",
        "example.com",
        "--project",
        "prj_a10000000000000000000000",
        "--json",
      ],
      deps(),
    );

    expect(paid.stdout).toContain("backlinks total");
    expect(paid.stdout).toContain("Source domain");
    expect(paid.stdout).toContain("reddit.com");
    expect(paid.stdout).toContain("  -");
    expect(paid.stderr).toBe(
      "Paid lookup: $0.05 charged to your DataForSEO account (snapshot cached for 24h).\n",
    );
    expect(cached.stderr).toBe("");
    expect(JSON.parse(cached.stdout)).toMatchObject({ data: { cached: true, cost_cents: 0 } });
  });

  it("aggregates the domains view locally and exports the current view as CSV", async () => {
    sdk.client.analyzeBacklinks
      .mockResolvedValueOnce(backlinksSnapshot({ cached: true, cost_cents: 0 }))
      .mockResolvedValueOnce(backlinksSnapshot({ cached: true, cost_cents: 0 }));

    const human = await runCli(
      [
        "backlinks",
        "analyze",
        "example.com",
        "--project",
        "prj_a10000000000000000000000",
        "--view",
        "domains",
      ],
      deps(),
    );
    const csv = await runCli(
      [
        "backlinks",
        "analyze",
        "example.com",
        "--project",
        "prj_a10000000000000000000000",
        "--view",
        "domains",
        "--csv",
      ],
      deps(),
    );

    expect(human.stdout).toContain("within fetched rows (3 of 1685)");
    expect(human.stdout).toMatch(/reddit\.com\s+2\s+91/);
    expect(human.stdout).toMatch(/blog\.example\s+1\s+40/);
    expect(csv.stdout).toBe(
      "source_domain,row_count,max_domain_authority\nreddit.com,2,91\nblog.example,1,40\n",
    );
  });

  it("loads more rows with mapped scope options and reports the updated count", async () => {
    sdk.client.loadMoreBacklinkRows.mockResolvedValueOnce(
      backlinksSnapshot({
        fetched_row_count: 203,
        include_subdomains: false,
        rows: [{ source_domain: "one.example" }, { source_domain: "two.example" }],
        target_scope: "page",
      }),
    );

    const result = await runCli(
      [
        "backlinks",
        "more",
        "https://example.com/pricing",
        "--project",
        "prj_a10000000000000000000000",
        "--page",
        "--no-subdomains",
        "--limit",
        "200",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Fetched 2 more rows.");
    expect(result.stdout).toContain("203 / 1685");
    expect(result.stderr).toBe(
      "Paid lookup: $0.05 charged to your DataForSEO account (snapshot cached for 24h).\n",
    );
    expect(sdk.client.loadMoreBacklinkRows).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      includeSubdomains: false,
      limit: 200,
      target: "https://example.com/pricing",
      targetScope: "page",
    });
  });

  it("passes more JSON through without a cached cost notice", async () => {
    sdk.client.loadMoreBacklinkRows.mockResolvedValueOnce(
      backlinksSnapshot({ cached: true, cost_cents: 0 }),
    );

    const result = await runCli(
      ["backlinks", "more", "example.com", "--project", "prj_a10000000000000000000000", "--json"],
      deps(),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ data: { cached: true } });
    expect(result.stderr).toBe("");
    expect(sdk.client.loadMoreBacklinkRows).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      includeSubdomains: true,
      limit: 100,
      target: "example.com",
      targetScope: "site",
    });
  });

  it("validates analyze and more inputs before calling the SDK", async () => {
    const missingAnalyze = await runCli(["backlinks", "analyze"], deps());
    expect(missingAnalyze.stderr).toContain("Pass a backlinks target");

    const badAnalyzeLimit = await runCli(
      ["backlinks", "analyze", "example.com", "--limit", "200"],
      deps(),
    );
    expect(badAnalyzeLimit.stderr).toContain("--limit must be one of 100, 300, 500, 1000");

    const badMode = await runCli(
      ["backlinks", "analyze", "example.com", "--mode", "broad"],
      deps(),
    );
    expect(badMode.stderr).toContain("--mode must be one of as-is, one-per-domain");

    const badView = await runCli(
      ["backlinks", "analyze", "example.com", "--view", "countries"],
      deps(),
    );
    expect(badView.stderr).toContain("--view must be one of links, domains, pages, anchors");

    const missingMore = await runCli(["backlinks", "more"], deps());
    expect(missingMore.stderr).toContain("Pass a backlinks target");

    const badMoreLimit = await runCli(
      ["backlinks", "more", "example.com", "--limit", "150"],
      deps(),
    );
    expect(badMoreLimit.stderr).toContain("--limit must be a multiple of 100");

    expect(sdk.client.analyzeBacklinks).not.toHaveBeenCalled();
    expect(sdk.client.loadMoreBacklinkRows).not.toHaveBeenCalled();
  });
});

describe("keywords bulk", () => {
  it("adds tags, sets frequency, and deletes in bulk", async () => {
    sdk.client.bulkUpdateKeywords
      .mockResolvedValueOnce({
        operation: "add_tags",
        results: [
          { keyword_id: "kw_a10000000000000000000000", status: "updated" },
          { keyword_id: "kw_a20000000000000000000000", status: "updated" },
        ],
      })
      .mockResolvedValueOnce({
        operation: "set_frequency",
        results: [{ keyword_id: "kw_a10000000000000000000000", status: "updated" }],
      })
      .mockResolvedValueOnce({
        operation: "delete",
        results: [{ keyword_id: "kw_a10000000000000000000000", status: "deleted" }],
      })
      .mockResolvedValueOnce({
        operation: "set_target_url",
        results: [{ keyword_id: "kw_a10000000000000000000000", status: "updated" }],
      });

    const tagged = await runCli(
      [
        "keywords",
        "bulk",
        "add_tags",
        "--id",
        "kw_a10000000000000000000000",
        "--ids",
        "kw_a20000000000000000000000",
        "--tags",
        "api,launch",
      ],
      deps(),
    );
    expect(tagged.exitCode).toBe(0);
    expect(tagged.stdout).toContain("kw_a10000000000000000000000");
    expect(sdk.client.bulkUpdateKeywords).toHaveBeenNthCalledWith(1, {
      keyword_ids: ["kw_a10000000000000000000000", "kw_a20000000000000000000000"],
      operation: "add_tags",
      tags: ["api", "launch"],
    });

    await runCli(
      [
        "keywords",
        "bulk",
        "set_frequency",
        "--ids",
        "kw_a10000000000000000000000",
        "--frequency",
        "weekly",
        "--json",
      ],
      deps(),
    );
    expect(sdk.client.bulkUpdateKeywords).toHaveBeenNthCalledWith(2, {
      frequency: "weekly",
      keyword_ids: ["kw_a10000000000000000000000"],
      operation: "set_frequency",
    });

    await runCli(["keywords", "bulk", "delete", "--ids", "kw_a10000000000000000000000"], deps());
    expect(sdk.client.bulkUpdateKeywords).toHaveBeenNthCalledWith(3, {
      keyword_ids: ["kw_a10000000000000000000000"],
      operation: "delete",
    });

    await runCli(
      ["keywords", "bulk", "set_target_url", "--ids", "kw_a10000000000000000000000"],
      deps(),
    );
    expect(sdk.client.bulkUpdateKeywords).toHaveBeenNthCalledWith(4, {
      keyword_ids: ["kw_a10000000000000000000000"],
      operation: "set_target_url",
      target_url: null,
    });
  });

  it("accepts a full bulk body as JSON", async () => {
    sdk.client.bulkUpdateKeywords.mockResolvedValueOnce({
      operation: "remove_tags",
      results: [{ keyword_id: "kw_a10000000000000000000000", status: "updated" }],
    });

    const body = JSON.stringify({
      keyword_ids: ["kw_a10000000000000000000000"],
      operation: "remove_tags",
      tags: ["api"],
    });
    const result = await runCli(["keywords", "bulk", "--input-json", body, "--json"], deps());

    expect(JSON.parse(result.stdout)).toMatchObject({ operation: "remove_tags" });
    expect(sdk.client.bulkUpdateKeywords).toHaveBeenCalledWith({
      keyword_ids: ["kw_a10000000000000000000000"],
      operation: "remove_tags",
      tags: ["api"],
    });
  });

  it("validates bulk operations and required flags", async () => {
    const missingOperation = await runCli(["keywords", "bulk"], deps());
    expect(missingOperation.stderr).toContain("Pass a bulk operation");

    const badOperation = await runCli(["keywords", "bulk", "rename"], deps());
    expect(badOperation.stderr).toContain("Bulk operation must be one of");

    const missingIds = await runCli(["keywords", "bulk", "delete"], deps());
    expect(missingIds.stderr).toContain("Pass at least one keyword ID");

    const missingTags = await runCli(
      ["keywords", "bulk", "add_tags", "--ids", "kw_a10000000000000000000000"],
      deps(),
    );
    expect(missingTags.stderr).toContain("add_tags requires --tag or --tags");

    const missingFrequency = await runCli(
      ["keywords", "bulk", "set_frequency", "--ids", "kw_a10000000000000000000000"],
      deps(),
    );
    expect(missingFrequency.stderr).toContain("set_frequency requires --frequency");
  });
});

describe("projects commands", () => {
  it("creates a project with a personal access token", async () => {
    sdk.client.createProject.mockResolvedValueOnce(project({ id: "prj_new000000000000000000000" }));

    const result = await runCli(
      [
        "projects",
        "create",
        "--name",
        "Example",
        "--domain",
        "example.com",
        "--tracking-scope",
        "city",
      ],
      deps(),
    );

    expect(result.stdout).toContain("prj_new000000000000000000000");
    expect(sdk.client.createProject).toHaveBeenCalledWith({
      domain: "example.com",
      name: "Example",
      trackingScope: "city",
    });
  });

  it("creates and selects a project with --use", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-create-use-"));
    const config = join(dir, "config.json");
    sdk.client.createProject.mockResolvedValueOnce(project({ id: "prj_new000000000000000000000" }));

    const result = await runCli(
      [
        "projects",
        "create",
        "--name",
        "Example",
        "--domain",
        "example.com",
        "--use",
        "--config",
        config,
      ],
      deps({ homeDir: dir }),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(config, "utf8"))).toMatchObject({
      projectId: "prj_new000000000000000000000",
    });
  });

  it("rejects a created project with a raw ID before saving it as current", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-create-use-raw-id-"));
    const config = join(dir, "config.json");
    sdk.client.createProject.mockResolvedValueOnce(project({ id: `c${"a".repeat(24)}` }));

    const result = await runCli(
      [
        "projects",
        "create",
        "--name",
        "Example",
        "--domain",
        "example.com",
        "--use",
        "--config",
        config,
      ],
      deps({ homeDir: dir }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Created project ID must use a public ID v3");
    await expect(readFile(config, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("selects a global project by domain and reports it as current", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-use-"));
    const config = join(dir, "config.json");
    const selected = project({
      domain: "acme.test",
      id: "prj_acme00000000000000000000",
      name: "Acme",
    });
    sdk.client.listProjects.mockResolvedValueOnce(list([project(), selected]));

    const used = await runCli(
      ["projects", "use", "acme.test", "--config", config, "--json"],
      deps({ homeDir: dir }),
    );

    expect(JSON.parse(used.stdout)).toMatchObject({
      project: { id: "prj_acme00000000000000000000" },
      source: "global",
    });
    expect(JSON.parse(await readFile(config, "utf8"))).toMatchObject({
      projectId: "prj_acme00000000000000000000",
    });

    sdk.client.getProject.mockResolvedValueOnce(selected);
    const current = await runCli(
      ["projects", "current", "--config", config, "--json"],
      deps({ homeDir: dir }),
    );
    expect(JSON.parse(current.stdout)).toMatchObject({
      project: { id: "prj_acme00000000000000000000" },
      source: "global",
    });
  });

  it("uses an interactive selector when projects use has no reference", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-picker-"));
    const config = join(dir, "config.json");
    sdk.client.listProjects.mockResolvedValueOnce(
      list([
        project(),
        project({ domain: "other.test", id: "prj_other0000000000000000000", name: "Other" }),
      ]),
    );

    const result = await runCli(
      ["projects", "use", "--config", config],
      deps({
        homeDir: dir,
        projectSelector: vi.fn(async () => "prj_other0000000000000000000"),
      }),
    );

    expect(result.stdout).toContain("prj_other0000000000000000000");
    expect(JSON.parse(await readFile(config, "utf8"))).toMatchObject({
      projectId: "prj_other0000000000000000000",
    });
  });

  it("requires explicit non-interactive selection and validates project references", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-reference-"));
    const projects = [
      project({ domain: "one.test", id: "prj_one000000000000000000000", name: "Shared" }),
      project({ domain: "two.test", id: "prj_two000000000000000000000", name: "Shared" }),
    ];
    sdk.client.listProjects.mockResolvedValue(list(projects));

    const nonInteractive = await runCli(["projects", "use"], deps({ homeDir: dir }));
    expect(nonInteractive.stderr).toContain("requires an interactive terminal");

    const ambiguous = await runCli(["projects", "use", "Shared"], deps({ homeDir: dir }));
    expect(ambiguous.stderr).toContain("is ambiguous");
    expect(ambiguous.stderr).toContain(
      "prj_one000000000000000000000, prj_two000000000000000000000",
    );

    const missing = await runCli(["projects", "use", "missing.test"], deps({ homeDir: dir }));
    expect(missing.stderr).toContain("was not found in your memberships");
  });

  it("explains when there are no projects to select", async () => {
    sdk.client.listProjects.mockResolvedValueOnce(list([]));

    const result = await runCli(["projects", "use", "--json"], deps());

    expect(result.stderr).toContain("Create a project first");
  });

  it("infers current only for a single project and accepts --project for use", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-inference-"));
    const config = join(dir, "config.json");
    const onlyProject = project({ id: "prj_only00000000000000000000", name: "Only" });
    sdk.client.listProjects.mockResolvedValueOnce(list([onlyProject]));
    sdk.client.getProject.mockResolvedValueOnce(onlyProject);

    const current = await runCli(
      ["projects", "current", "--config", config, "--json"],
      deps({ homeDir: dir }),
    );
    expect(JSON.parse(current.stdout)).toMatchObject({
      project: { id: "prj_only00000000000000000000" },
      source: "inferred",
    });

    sdk.client.listProjects.mockResolvedValueOnce(list([onlyProject]));
    const used = await runCli(
      ["projects", "use", "--project", "prj_only00000000000000000000", "--config", config],
      deps({ homeDir: dir }),
    );
    expect(used.stdout).toContain("prj_only00000000000000000000");
  });

  it("auto-selects a sole project and supports the switch alias by name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-single-"));
    const config = join(dir, "config.json");
    const onlyProject = project({ id: "prj_only00000000000000000000", name: "Only" });
    sdk.client.listProjects.mockResolvedValueOnce(list([onlyProject]));

    const used = await runCli(["projects", "use", "--config", config], deps({ homeDir: dir }));
    expect(used.stdout).toContain("prj_only00000000000000000000");

    sdk.client.listProjects.mockResolvedValueOnce(list([onlyProject]));
    const switched = await runCli(
      ["projects", "switch", "Only", "--config", config, "--json"],
      deps({ homeDir: dir }),
    );
    expect(JSON.parse(switched.stdout)).toMatchObject({
      project: { id: "prj_only00000000000000000000" },
    });
  });

  it("prints the human current project and supports JSON unlink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-current-"));
    const config = join(dir, "config.json");
    await writeFile(config, JSON.stringify({ projectId: "prj_current00000000000000000" }));
    sdk.client.getProject.mockResolvedValueOnce(
      project({ domain: "current.test", id: "prj_current00000000000000000", name: "Current" }),
    );

    const current = await runCli(
      ["projects", "current", "--config", config],
      deps({ cwd: dir, homeDir: dir }),
    );
    expect(current.stdout).toMatch(/source\s+global/);

    sdk.client.listProjects.mockResolvedValueOnce(
      list([
        project({ domain: "current.test", id: "prj_current00000000000000000", name: "Current" }),
      ]),
    );
    const linked = await runCli(["link"], deps({ cwd: dir, homeDir: dir }));
    expect(linked.stdout).toContain("linked project");

    const unlinked = await runCli(["unlink", "--json"], deps({ cwd: dir, homeDir: dir }));
    expect(JSON.parse(unlinked.stdout)).toMatchObject({ unlinked: true });
  });

  it("links and unlinks the current directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-link-"));
    sdk.client.listProjects.mockResolvedValueOnce(
      list([project({ domain: "acme.test", id: "prj_acme00000000000000000000", name: "Acme" })]),
    );

    const linked = await runCli(
      ["link", "prj_acme00000000000000000000", "--json"],
      deps({ cwd: dir, homeDir: dir }),
    );
    expect(JSON.parse(linked.stdout)).toMatchObject({
      project: { id: "prj_acme00000000000000000000" },
    });
    expect(JSON.parse(await readFile(join(dir, ".bisibility", "project.json"), "utf8"))).toEqual({
      projectId: "prj_acme00000000000000000000",
    });
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain(".bisibility/");

    const unlinked = await runCli(["unlink"], deps({ cwd: dir, homeDir: dir }));
    expect(unlinked.stdout).toContain("Unlinked");
    await expect(readFile(join(dir, ".bisibility", "project.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });

    const missing = await runCli(["unlink"], deps({ cwd: dir, homeDir: dir }));
    expect(missing.stderr).toContain("No .bisibility/project.json link was found");
  });

  it("rejects a selected project with a raw ID before writing a directory link", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-link-raw-id-"));
    sdk.client.listProjects.mockResolvedValueOnce(list([project({ id: `c${"a".repeat(24)}` })]));

    const result = await runCli(["link"], deps({ cwd: dir, homeDir: dir }));

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Selected project ID must use a public ID v3");
    await expect(readFile(join(dir, ".bisibility", "project.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("lists, gets, updates, and deletes projects", async () => {
    sdk.client.listProjects.mockResolvedValueOnce(list([project()]));
    sdk.client.getProject.mockResolvedValueOnce(project());
    sdk.client.updateProject.mockResolvedValueOnce(project({ name: "Renamed" }));
    sdk.client.deleteProject.mockResolvedValueOnce(project());

    const listed = await runCli(["projects", "list"], deps());
    expect(listed.stdout).toContain("prj_a10000000000000000000000");
    expect(listed.stdout).toContain("active");

    const got = await runCli(["projects", "get", "prj_a10000000000000000000000"], deps());
    expect(got.stdout).toContain("example.com");
    expect(sdk.client.getProject).toHaveBeenCalledWith("prj_a10000000000000000000000");

    const updated = await runCli(
      [
        "projects",
        "update",
        "prj_a10000000000000000000000",
        "--name",
        "Renamed",
        "--domain",
        "renamed.com",
      ],
      deps(),
    );
    expect(updated.stdout).toContain("Renamed");
    expect(sdk.client.updateProject).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      domain: "renamed.com",
      name: "Renamed",
    });

    const deleted = await runCli(["projects", "delete", "prj_a10000000000000000000000"], deps());
    expect(deleted.stdout).toContain("deleted  prj_a10000000000000000000000");
    expect(sdk.client.deleteProject).toHaveBeenCalledWith("prj_a10000000000000000000000");
  });

  it("includes the effective project context in JSON project lists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-project-list-json-"));
    const config = join(dir, "config.json");
    await writeFile(config, JSON.stringify({ projectId: "prj_a10000000000000000000000" }));
    sdk.client.listProjects.mockResolvedValueOnce(list([project()]));

    const result = await runCli(
      ["projects", "list", "--config", config, "--json"],
      deps({ homeDir: dir }),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({
      context: { project_id: "prj_a10000000000000000000000", source: "global" },
      data: [{ id: "prj_a10000000000000000000000" }],
    });

    sdk.client.listProjects.mockResolvedValueOnce(
      list([project(), project({ id: "prj_a20000000000000000000000", name: "Second" })]),
    );
    const withoutSelection = await runCli(["projects", "list", "--json"], deps({ homeDir: dir }));
    expect(JSON.parse(withoutSelection.stdout)).toMatchObject({
      context: { project_id: null, source: null },
    });
  });

  it("resolves the project for get when no positional ID is passed", async () => {
    sdk.client.listProjects.mockResolvedValueOnce(
      list([project({ id: "prj_default00000000000000000" })]),
    );
    sdk.client.getProject.mockResolvedValueOnce(project({ id: "prj_default00000000000000000" }));

    const result = await runCli(["projects", "get", "--json"], deps());

    expect(JSON.parse(result.stdout)).toMatchObject({ id: "prj_default00000000000000000" });
    expect(sdk.client.getProject).toHaveBeenCalledWith("prj_default00000000000000000");
  });

  it("updates project defaults", async () => {
    sdk.client.updateProjectDefaults.mockResolvedValueOnce(
      projectDefaults({ city: "Krakow", country: "Poland" }),
    );

    const result = await runCli(
      [
        "projects",
        "defaults",
        "prj_a10000000000000000000000",
        "--country",
        "Poland",
        "--city",
        "Krakow",
        "--location-key",
        "pl-krakow",
        "--device",
        "mobile",
        "--frequency",
        "weekly",
        "--cron-expression",
        "0 6 * * 1",
        "--jitter-minutes",
        "10",
        "--timezone",
        "Europe/Warsaw",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Krakow");
    expect(sdk.client.updateProjectDefaults).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      city: "Krakow",
      country: "Poland",
      cron_expression: "0 6 * * 1",
      device: "mobile",
      frequency: "weekly",
      jitter_minutes: 10,
      location_key: "pl-krakow",
      timezone: "Europe/Warsaw",
    });
  });

  it("reads project defaults when no defaults flag is given", async () => {
    sdk.client.getProjectDefaults.mockResolvedValueOnce(projectDefaults());

    const result = await runCli(["projects", "defaults", "prj_a10000000000000000000000"], deps());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("market source   derived");
    expect(sdk.client.getProjectDefaults).toHaveBeenCalledWith("prj_a10000000000000000000000");
    expect(sdk.client.updateProjectDefaults).not.toHaveBeenCalled();
  });

  it("keeps patch behavior when one defaults flag is given", async () => {
    sdk.client.updateProjectDefaults.mockResolvedValueOnce(projectDefaults({ country: "Poland" }));

    const result = await runCli(
      ["projects", "defaults", "prj_a10000000000000000000000", "--country", "Poland"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(sdk.client.getProjectDefaults).not.toHaveBeenCalled();
    expect(sdk.client.updateProjectDefaults).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      country: "Poland",
    });
  });

  it("prints raw project defaults JSON on read", async () => {
    const defaults = projectDefaults();
    sdk.client.getProjectDefaults.mockResolvedValueOnce(defaults);

    const result = await runCli(
      ["projects", "defaults", "prj_a10000000000000000000000", "--json"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(defaults);
    expect(sdk.client.getProjectDefaults).toHaveBeenCalledWith("prj_a10000000000000000000000");
    expect(sdk.client.updateProjectDefaults).not.toHaveBeenCalled();
  });

  it("omits retired auto schedule from project defaults output", async () => {
    sdk.client.updateProjectDefaults.mockResolvedValueOnce(projectDefaults());

    const result = await runCli(
      ["projects", "defaults", "prj_a10000000000000000000000", "--country", "United States"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("auto schedule");
  });

  it("renders project defaults market source and serp settings", async () => {
    sdk.client.updateProjectDefaults.mockResolvedValueOnce(projectDefaults());

    const result = await runCli(
      ["projects", "defaults", "prj_a10000000000000000000000", "--country", "United States"],
      deps(),
    );

    expect(result.stdout).toContain("market source   derived");
    expect(result.stdout).toContain("serp depth      100");
    expect(result.stdout).toContain("stop on match   yes");
  });

  it("rejects the retired auto schedule option as unknown", async () => {
    sdk.client.updateProjectDefaults.mockResolvedValueOnce(projectDefaults());

    const result = await runCli(
      ["projects", "defaults", "prj_a10000000000000000000000", "--auto-schedule", "true"],
      deps(),
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Unknown long option --auto-schedule.");
  });

  it("validates project subcommands and defaults input", async () => {
    const badAction = await runCli(["projects", "archive"], deps());
    expect(badAction.stderr).toContain("Projects command must be");

    const missingUpdateId = await runCli(["projects", "update"], deps());
    expect(missingUpdateId.stderr).toContain("Pass a project ID");

    const missingUpdateFlags = await runCli(
      ["projects", "update", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(missingUpdateFlags.stderr).toContain("projects update requires --name or --domain");

    const emptyDefaultsPatch = await runCli(
      ["projects", "defaults", "prj_a10000000000000000000000", "--country="],
      deps(),
    );
    expect(emptyDefaultsPatch.stderr).toContain("Pass at least one project defaults flag");

    const badJitter = await runCli(
      ["projects", "defaults", "prj_a10000000000000000000000", "--jitter-minutes=-3"],
      deps(),
    );
    expect(badJitter.stderr).toContain("--jitter-minutes must be a non-negative integer");

    const missingCreate = await runCli(["projects", "create"], deps());
    expect(missingCreate.stderr).toContain("projects create requires --name");

    const badScope = await runCli(
      [
        "projects",
        "create",
        "--name",
        "Example",
        "--domain",
        "example.com",
        "--tracking-scope",
        "region",
      ],
      deps(),
    );
    expect(badScope.stderr).toContain("--tracking-scope must be city or country");
  });
});

describe("api-keys commands", () => {
  it("lists API keys across pages", async () => {
    sdk.client.listApiKeys
      .mockResolvedValueOnce(
        list([apiKeyResource({ id: "key_a10000000000000000000000" })], "next_keys"),
      )
      .mockResolvedValueOnce(
        list([apiKeyResource({ id: "key_a20000000000000000000000", name: "Deploy key" })]),
      );

    const result = await runCli(["api-keys", "list", "--limit", "1", "--all", "--json"], deps());

    expect(JSON.parse(result.stdout).data).toHaveLength(2);
    expect(sdk.client.listApiKeys).toHaveBeenNthCalledWith(1, { limit: 1 });
    expect(sdk.client.listApiKeys).toHaveBeenNthCalledWith(2, { cursor: "next_keys", limit: 1 });
  });

  it("creates and revokes API keys", async () => {
    sdk.client.createApiKey.mockResolvedValueOnce({
      ...apiKeyResource({ id: "key_new000000000000000000000" }),
      masked_value: "bsb_key_live_abcd******wxyz",
      token: "bsb_key_live_secret_token",
    });
    sdk.client.revokeApiKey.mockResolvedValueOnce(
      apiKeyResource({
        id: "key_a10000000000000000000000",
        revoked_at: "2026-01-05T00:00:00.000Z",
      }),
    );

    const created = await runCli(["api-keys", "create", "--name", "CI key"], deps());
    expect(created.stdout).toContain("bsb_key_live_secret_token");
    expect(sdk.client.createApiKey).toHaveBeenCalledWith({ name: "CI key" });

    const revoked = await runCli(["api-keys", "revoke", "key_a10000000000000000000000"], deps());
    expect(revoked.stdout).toContain("2026-01-05T00:00:00.000Z");
    expect(sdk.client.revokeApiKey).toHaveBeenCalledWith("key_a10000000000000000000000");
  });

  it("scopes list and create to a project when --project is passed", async () => {
    sdk.client.listProjectApiKeys.mockResolvedValueOnce(
      list([apiKeyResource({ id: "key_p00000000000000000000000" })]),
    );
    sdk.client.createProjectApiKey.mockResolvedValueOnce({
      ...apiKeyResource({ id: "key_pnew00000000000000000000" }),
      masked_value: "bsb_key_live_abcd******wxyz",
      token: "bsb_key_live_project_token",
    });

    const listed = await runCli(
      ["api-keys", "list", "--project", "prj_a10000000000000000000000", "--json"],
      deps(),
    );
    expect(JSON.parse(listed.stdout).data[0].id).toBe("key_p00000000000000000000000");
    expect(sdk.client.listProjectApiKeys).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
    expect(sdk.client.listApiKeys).not.toHaveBeenCalled();

    const created = await runCli(
      ["api-keys", "create", "--project", "prj_a10000000000000000000000", "--name", "CI key"],
      deps(),
    );
    expect(created.stdout).toContain("bsb_key_live_project_token");
    expect(sdk.client.createProjectApiKey).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      name: "CI key",
    });
  });

  it("validates api-keys subcommands and inputs", async () => {
    sdk.client.listApiKeys.mockResolvedValueOnce(list([apiKeyResource()]));

    const defaultList = await runCli(["api-keys"], deps());
    expect(defaultList.stdout).toContain("key_a10000000000000000000000");

    const missingName = await runCli(["api-keys", "create"], deps());
    expect(missingName.stderr).toContain("api-keys create requires --name");

    const missingId = await runCli(["api-keys", "revoke"], deps());
    expect(missingId.stderr).toContain("Pass an API key ID");

    const badAction = await runCli(["api-keys", "rotate"], deps());
    expect(badAction.stderr).toContain("Api-keys command must be list, create, or revoke");
  });
});

describe("rank checks", () => {
  it("runs a rank check with an optional provider", async () => {
    sdk.client.runRankCheck.mockResolvedValueOnce(rankCheck());

    const result = await runCli(
      ["check", "kw_a10000000000000000000000", "--provider-id", "dataforseo"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("position  4");
    expect(sdk.client.runRankCheck).toHaveBeenCalledWith("kw_a10000000000000000000000", {
      provider_id: "dataforseo",
    });
  });

  it("prints rank check JSON and requires a keyword ID", async () => {
    sdk.client.runRankCheck.mockResolvedValueOnce(
      rankCheck({ id: "check_json00000000000000000000" }),
    );

    const json = await runCli(["check", "kw_a10000000000000000000000", "--json"], deps());
    expect(JSON.parse(json.stdout)).toMatchObject({ id: "check_json00000000000000000000" });

    const missing = await runCli(["check"], deps());
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("Pass a keyword ID");
  });

  it("queues an async rank check with the run subcommand", async () => {
    sdk.client.runRankCheck.mockResolvedValueOnce(
      rankCheck({ id: "check_async0000000000000000000", position: null, status: "running" }),
    );

    const result = await runCli(
      ["check", "run", "kw_a10000000000000000000000", "--provider-id", "dataforseo", "--async"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("status    running");
    expect(sdk.client.runRankCheck).toHaveBeenCalledWith(
      "kw_a10000000000000000000000",
      { provider_id: "dataforseo" },
      { async: true },
    );
  });

  it("gets a single rank check result", async () => {
    sdk.client.getRankCheckResult.mockResolvedValueOnce(
      rankCheck({ id: "check_a10000000000000000000000" }),
    );

    const result = await runCli(["check", "get", "check_a10000000000000000000000"], deps());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("check     check_a10000000000000000000000");
    expect(sdk.client.getRankCheckResult).toHaveBeenCalledWith("check_a10000000000000000000000");

    sdk.client.getRankCheckResult.mockResolvedValueOnce(
      rankCheck({ id: "check_a10000000000000000000000" }),
    );
    const json = await runCli(["check", "get", "check_a10000000000000000000000", "--json"], deps());
    expect(JSON.parse(json.stdout)).toMatchObject({ id: "check_a10000000000000000000000" });

    const missing = await runCli(["check", "get"], deps());
    expect(missing.stderr).toContain("Pass a rank check ID");
  });

  it("lists rank checks with status and date filters across pages", async () => {
    sdk.client.listRankChecks
      .mockResolvedValueOnce(
        list([rankCheck({ id: "check_a10000000000000000000000" })], "next_checks"),
      )
      .mockResolvedValueOnce(
        list([rankCheck({ id: "check_a20000000000000000000000", status: "failed" })]),
      );

    const result = await runCli(
      [
        "check",
        "list",
        "kw_a10000000000000000000000",
        "--status",
        "completed",
        "--since",
        "2026-01-01T00:00:00Z",
        "--until",
        "2026-02-01T00:00:00Z",
        "--limit",
        "1",
        "--all",
        "--json",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data).toHaveLength(2);
    expect(sdk.client.listRankChecks).toHaveBeenNthCalledWith(1, "kw_a10000000000000000000000", {
      limit: 1,
      since: "2026-01-01T00:00:00Z",
      status: "completed",
      until: "2026-02-01T00:00:00Z",
    });
    expect(sdk.client.listRankChecks).toHaveBeenNthCalledWith(2, "kw_a10000000000000000000000", {
      cursor: "next_checks",
      limit: 1,
      since: "2026-01-01T00:00:00Z",
      status: "completed",
      until: "2026-02-01T00:00:00Z",
    });
  });

  it("renders rank checks as a table", async () => {
    sdk.client.listRankChecks.mockResolvedValueOnce(list([rankCheck()]));

    const result = await runCli(["check", "list", "kw_a10000000000000000000000"], deps());

    expect(result.stdout).toContain("check_a10000000000000000000000");
    expect(result.stdout).toContain("completed");
  });

  it("validates rank check list filters", async () => {
    const missingKeyword = await runCli(["check", "list"], deps());
    expect(missingKeyword.stderr).toContain("Pass a keyword ID");

    const badStatus = await runCli(
      ["check", "list", "kw_a10000000000000000000000", "--status", "pending"],
      deps(),
    );
    expect(badStatus.stderr).toContain("--status must be one of completed, failed, running");

    const badSince = await runCli(
      ["check", "list", "kw_a10000000000000000000000", "--since", "yesterday"],
      deps(),
    );
    expect(badSince.stderr).toContain("--since must be a valid ISO-8601 date-time");

    const badUntil = await runCli(
      ["check", "list", "kw_a10000000000000000000000", "--until", "later"],
      deps(),
    );
    expect(badUntil.stderr).toContain("--until must be a valid ISO-8601 date-time");

    const missingRun = await runCli(["check", "run"], deps());
    expect(missingRun.stderr).toContain("Pass a keyword ID");
  });

  it("accepts plausible as a provider ID and rejects unknown providers", async () => {
    sdk.client.runRankCheck.mockResolvedValueOnce(rankCheck({ provider: "plausible" }));

    const plausible = await runCli(
      ["check", "kw_a10000000000000000000000", "--provider-id", "plausible"],
      deps(),
    );
    expect(plausible.exitCode).toBe(0);
    expect(sdk.client.runRankCheck).toHaveBeenCalledWith("kw_a10000000000000000000000", {
      provider_id: "plausible",
    });

    const invalid = await runCli(
      ["check", "kw_a10000000000000000000000", "--provider-id", "bing"],
      deps(),
    );
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain(
      "--provider-id must be one of dataforseo, ga4, gsc, plausible, serpapi",
    );
  });

  it("surfaces Retry-After on 429 responses", async () => {
    sdk.client.runRankCheck.mockRejectedValueOnce(
      new BisibilityApiError("Rate limit exceeded.", {
        body: undefined,
        headers: new Headers({ "Retry-After": "42" }),
        method: "POST",
        problem: { detail: "Rate limit exceeded." },
        status: 429,
        url: "https://api.test/api/v1/keywords/kw_a10000000000000000000000/checks",
      }),
    );

    const result = await runCli(["check", "kw_a10000000000000000000000"], deps());

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("API error 429: Rate limit exceeded. Retry after 42s.\n");
  });

  it("keeps non-429 API errors unchanged", async () => {
    sdk.client.runRankCheck.mockRejectedValueOnce(
      new BisibilityApiError("Keyword not found.", {
        body: undefined,
        headers: new Headers({ "Retry-After": "42" }),
        method: "POST",
        problem: { detail: "Keyword not found." },
        status: 404,
        url: "https://api.test/api/v1/keywords/kw_a10000000000000000000000/checks",
      }),
    );

    const result = await runCli(["check", "kw_a10000000000000000000000"], deps());

    expect(result.stderr).toBe("API error 404: Keyword not found.\n");
  });
});

describe("signals commands", () => {
  it("creates a signal with all flags", async () => {
    sdk.client.createSignal.mockResolvedValueOnce(
      signal({
        keyword_id: "kw_a10000000000000000000000",
        severity: "warning",
        url: "https://example.com/blog",
      }),
    );

    const result = await runCli(
      [
        "signals",
        "create",
        "--source",
        "deploy",
        "--type",
        "deploy.completed",
        "--severity",
        "warning",
        "--keyword-id",
        "kw_a10000000000000000000000",
        "--url",
        "https://example.com/blog",
        "--payload",
        '{"sha":"abc123"}',
        "--happened-at",
        "2026-07-01T12:00:00Z",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("sig_a10000000000000000000000");
    expect(result.stdout).toContain("deploy.completed");
    expect(sdk.client.createSignal).toHaveBeenCalledWith({
      happened_at: "2026-07-01T12:00:00Z",
      keyword_id: "kw_a10000000000000000000000",
      payload: { sha: "abc123" },
      severity: "warning",
      source: "deploy",
      type: "deploy.completed",
      url: "https://example.com/blog",
    });
  });

  it("creates a minimal signal as JSON", async () => {
    sdk.client.createSignal.mockResolvedValueOnce(signal({ id: "sig_json00000000000000000000" }));

    const result = await runCli(
      ["signals", "create", "--source", "api", "--type", "content.updated", "--json"],
      deps(),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ id: "sig_json00000000000000000000" });
    expect(sdk.client.createSignal).toHaveBeenCalledWith({
      source: "api",
      type: "content.updated",
    });
  });

  it("accepts a payload at exactly the 8KB serialized limit", async () => {
    sdk.client.createSignal.mockResolvedValueOnce(signal({ id: "sig_limit0000000000000000000" }));

    // {"blob":"…"} wraps the value in 11 bytes, so 8181 chars serializes to exactly 8192 bytes.
    const payload = { blob: "x".repeat(8181) };
    expect(Buffer.byteLength(JSON.stringify(payload), "utf8")).toBe(8192);

    const result = await runCli(
      [
        "signals",
        "create",
        "--source",
        "api",
        "--type",
        "content.updated",
        "--payload",
        JSON.stringify(payload),
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(sdk.client.createSignal).toHaveBeenCalledWith({
      payload,
      source: "api",
      type: "content.updated",
    });
  });

  it("validates signal create inputs", async () => {
    const missingSource = await runCli(["signals", "create", "--type", "deploy.completed"], deps());
    expect(missingSource.stderr).toContain("signals create requires --source");

    const badSource = await runCli(
      ["signals", "create", "--source", "manual", "--type", "deploy.completed"],
      deps(),
    );
    expect(badSource.stderr).toContain("--source must be one of api, cms, deploy");

    const missingType = await runCli(["signals", "create", "--source", "deploy"], deps());
    expect(missingType.stderr).toContain("signals create requires --type");

    const badSeverity = await runCli(
      [
        "signals",
        "create",
        "--source",
        "deploy",
        "--type",
        "deploy.completed",
        "--severity",
        "high",
      ],
      deps(),
    );
    expect(badSeverity.stderr).toContain("--severity must be one of critical, info, warning");

    const badPayload = await runCli(
      ["signals", "create", "--source", "deploy", "--type", "deploy.completed", "--payload", "[1]"],
      deps(),
    );
    expect(badPayload.stderr).toContain("--payload must be a JSON object");

    const oversizedPayload = await runCli(
      [
        "signals",
        "create",
        "--source",
        "deploy",
        "--type",
        "deploy.completed",
        "--payload",
        JSON.stringify({ blob: "x".repeat(8192) }),
      ],
      deps(),
    );
    expect(oversizedPayload.stderr).toContain(
      "--payload must serialize to 8192 bytes (8KB) or less",
    );

    const badHappenedAt = await runCli(
      [
        "signals",
        "create",
        "--source",
        "deploy",
        "--type",
        "deploy.completed",
        "--happened-at",
        "yesterday",
      ],
      deps(),
    );
    expect(badHappenedAt.stderr).toContain("--happened-at must be a valid ISO-8601 date-time");

    expect(sdk.client.createSignal).not.toHaveBeenCalled();
  });

  it("lists signals with filters across pages", async () => {
    sdk.client.listSignals
      .mockResolvedValueOnce(list([signal({ id: "sig_a10000000000000000000000" })], "next_signals"))
      .mockResolvedValueOnce(list([signal({ id: "sig_a20000000000000000000000" })]));

    const result = await runCli(
      [
        "signals",
        "list",
        "--project",
        "prj_a10000000000000000000000",
        "--source",
        "deploy",
        "--type",
        "deploy.completed",
        "--from",
        "2026-07-01T00:00:00Z",
        "--to",
        "2026-07-02T00:00:00Z",
        "--limit",
        "1",
        "--all",
        "--json",
      ],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).data).toHaveLength(2);
    expect(sdk.client.listSignals).toHaveBeenNthCalledWith(1, "prj_a10000000000000000000000", {
      from: "2026-07-01T00:00:00Z",
      limit: 1,
      source: "deploy",
      to: "2026-07-02T00:00:00Z",
      type: "deploy.completed",
    });
    expect(sdk.client.listSignals).toHaveBeenNthCalledWith(2, "prj_a10000000000000000000000", {
      cursor: "next_signals",
      from: "2026-07-01T00:00:00Z",
      limit: 1,
      source: "deploy",
      to: "2026-07-02T00:00:00Z",
      type: "deploy.completed",
    });
  });

  it("lists signals as a table with the default action and resolves the project", async () => {
    sdk.client.listProjects.mockResolvedValueOnce(list([project()]));
    sdk.client.listSignals.mockResolvedValueOnce(
      list([signal({ source: "rank_tracker", type: "rank.improved" })]),
    );

    const result = await runCli(["signals"], deps());

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("rank_tracker");
    expect(result.stdout).toContain("rank.improved");
    expect(sdk.client.listSignals).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
  });

  it("validates signal list filters and subcommands", async () => {
    const badSource = await runCli(["signals", "list", "--source", "webhook"], deps());
    expect(badSource.stderr).toContain("--source must be one of api, cms, deploy, manual");

    const badFrom = await runCli(["signals", "list", "--from", "yesterday"], deps());
    expect(badFrom.stderr).toContain("--from must be a valid ISO-8601 date-time");

    const badTo = await runCli(["signals", "list", "--to", "later"], deps());
    expect(badTo.stderr).toContain("--to must be a valid ISO-8601 date-time");

    const badAction = await runCli(["signals", "delete", "sig_a10000000000000000000000"], deps());
    expect(badAction.stderr).toContain("Signals command must be create or list");
  });

  it("requires an API key for signals commands", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "bisibility-cli-no-key-"));
    const result = await runCli(
      ["signals", "create", "--source", "deploy", "--type", "deploy.completed"],
      deps({ env: {}, homeDir }),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Not logged in. Run 'bisibility auth login', or set BISIBILITY_API_KEY.",
    );
  });
});

describe("location commands", () => {
  it("searches canonical locations as table and JSON", async () => {
    const response = list([
      {
        city_name: "Austin",
        country_code: "US",
        display_name: "Austin, Texas, United States",
        hl: "en",
        kind: "city",
        language_label: "English",
        location_key: "US/Texas/Austin",
        region_code: "TX",
        region_name: "Texas",
      },
    ]);
    sdk.client.searchLocations.mockResolvedValue(response);

    const table = await runCli(
      ["locations", "search", "Austin", "--country", "US", "--limit", "10"],
      deps(),
    );
    const json = await runCli(["locations", "search", "Austin", "--json"], deps());

    expect(table.stdout).toContain("US/Texas/Austin");
    expect(JSON.parse(json.stdout).data[0].kind).toBe("city");
    expect(sdk.client.searchLocations).toHaveBeenNthCalledWith(1, {
      country: "US",
      limit: 10,
      q: "Austin",
    });
  });

  it("validates the location action, query, and limit", async () => {
    const badAction = await runCli(["locations", "list"], deps());
    const missingQuery = await runCli(["locations", "search"], deps());
    const badLimit = await runCli(["locations", "search", "Austin", "--limit", "101"], deps());

    expect(badAction.stderr).toContain("Locations command must be search");
    expect(missingQuery.stderr).toContain("Pass location search text");
    expect(badLimit.stderr).toContain("--limit must not exceed 100");
    expect(sdk.client.searchLocations).not.toHaveBeenCalled();
  });
});

describe("analytics commands", () => {
  it("reads traffic snapshots and live query statistics", async () => {
    sdk.client.listTrafficSnapshots.mockResolvedValueOnce({
      offset: 5,
      rows: [
        {
          date: "2026-07-01",
          path: "/pricing",
          provider: "ga4",
          sessions: 42,
          visitors: 35,
        },
      ],
      total_count: 1,
    });
    sdk.client.listSearchPerformanceQueryStats.mockResolvedValueOnce({
      connection: { id: "gsc_1", label: "Search Console", provider: "gsc" },
      rows: [
        {
          clicks: 14,
          ctr: 0.2,
          impressions: 70,
          page: "/pricing",
          position: 4.5,
          query: "rank tracker",
        },
      ],
    });

    const traffic = await runCli(
      [
        "analytics",
        "traffic-snapshots",
        "--project",
        "prj_a10000000000000000000000",
        "--start-date",
        "2026-07-01",
        "--end-date",
        "2026-07-31",
        "--path",
        "/pricing",
        "--paths",
        "/docs,/blog",
        "--offset",
        "5",
        "--limit",
        "25",
      ],
      deps(),
    );
    const queries = await runCli(
      [
        "analytics",
        "query-stats",
        "--project",
        "prj_a10000000000000000000000",
        "--start-date",
        "2026-07-01",
        "--end-date",
        "2026-07-31",
        "--connection",
        "conn_gsc100000000000000000000",
        "--query",
        "rank tracker",
        "--json",
      ],
      deps(),
    );

    expect(traffic.stdout).toContain("/pricing");
    expect(JSON.parse(queries.stdout).rows[0].position).toBe(4.5);
    expect(sdk.client.listTrafficSnapshots).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      endDate: "2026-07-31",
      limit: 25,
      offset: 5,
      paths: ["/pricing", "/docs", "/blog"],
      startDate: "2026-07-01",
    });
    expect(sdk.client.listSearchPerformanceQueryStats).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      {
        connectionId: "conn_gsc100000000000000000000",
        endDate: "2026-07-31",
        limit: 100,
        query: "rank tracker",
        startDate: "2026-07-01",
      },
    );
  });

  it("synchronizes analytics with an idempotency key", async () => {
    sdk.client.syncProjectTraffic.mockResolvedValueOnce({
      connections: 1,
      keyword_snapshots: 2,
      page_snapshots: 3,
      project_id: "prj_a10000000000000000000000",
      runs: [
        {
          provider: "ga4",
          rows_fetched: 4,
          rows_matched: 3,
          rows_upserted: 3,
          status: "succeeded_with_data",
        },
      ],
      skipped: [],
    });

    const result = await runCli(
      [
        "analytics",
        "sync",
        "--project",
        "prj_a10000000000000000000000",
        "--idempotency-key",
        "sync-1",
      ],
      deps(),
    );

    expect(result.stdout).toContain("succeeded_with_data");
    expect(sdk.client.syncProjectTraffic).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      idempotencyKey: "sync-1",
    });
  });

  it("uses analytics defaults and supports alternate output modes", async () => {
    sdk.client.listTrafficSnapshots.mockResolvedValueOnce({ offset: 0, rows: [], total_count: 0 });
    sdk.client.listSearchPerformanceQueryStats.mockResolvedValueOnce({
      connection: { id: "gsc_1", label: "Search Console", provider: "gsc" },
      rows: [],
    });
    sdk.client.syncProjectTraffic.mockResolvedValueOnce({
      connections: 0,
      keyword_snapshots: 0,
      page_snapshots: 0,
      project_id: "prj_a10000000000000000000000",
      runs: [],
      skipped: [],
    });

    const traffic = await runCli(
      [
        "analytics",
        "traffic-snapshots",
        "--project",
        "prj_a10000000000000000000000",
        "--start-date",
        "2026-07-01",
        "--end-date",
        "2026-07-31",
        "--json",
      ],
      deps(),
    );
    const queries = await runCli(
      [
        "analytics",
        "query-stats",
        "--project",
        "prj_a10000000000000000000000",
        "--start-date",
        "2026-07-01",
        "--end-date",
        "2026-07-31",
      ],
      deps(),
    );
    const sync = await runCli(
      ["analytics", "sync", "--project", "prj_a10000000000000000000000", "--json"],
      deps(),
    );

    expect(JSON.parse(traffic.stdout).total_count).toBe(0);
    expect(queries.stdout).toContain("connection  gsc_1");
    expect(JSON.parse(sync.stdout).connections).toBe(0);
    expect(sdk.client.listTrafficSnapshots).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      endDate: "2026-07-31",
      limit: 50,
      offset: 0,
      startDate: "2026-07-01",
    });
    expect(sdk.client.listSearchPerformanceQueryStats).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      {
        endDate: "2026-07-31",
        limit: 100,
        startDate: "2026-07-01",
      },
    );
    expect(sdk.client.syncProjectTraffic).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      undefined,
    );
  });

  it("validates analytics arguments and actions", async () => {
    const missingDates = await runCli(
      ["analytics", "traffic-snapshots", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    const badOffset = await runCli(
      [
        "analytics",
        "traffic-snapshots",
        "--project",
        "prj_a10000000000000000000000",
        "--start-date",
        "2026-07-01",
        "--end-date",
        "2026-07-31",
        "--offset=-1",
      ],
      deps(),
    );
    const trafficLimit = await runCli(
      [
        "analytics",
        "traffic-snapshots",
        "--project",
        "prj_a10000000000000000000000",
        "--limit",
        "201",
      ],
      deps(),
    );
    const queryLimit = await runCli(
      ["analytics", "query-stats", "--project", "prj_a10000000000000000000000", "--limit", "1001"],
      deps(),
    );
    const badAction = await runCli(
      ["analytics", "unknown", "--project", "prj_a10000000000000000000000"],
      deps(),
    );

    expect(missingDates.stderr).toContain("Pass --end-date YYYY-MM-DD");
    expect(badOffset.stderr).toContain("--offset must be a non-negative integer");
    expect(trafficLimit.stderr).toContain("--limit must not exceed 200");
    expect(queryLimit.stderr).toContain("--limit must not exceed 1000");
    expect(badAction.stderr).toContain("Analytics command must be traffic-snapshots");
  });
});

describe("cost commands", () => {
  it("estimates cost without an API key", async () => {
    sdk.client.getCostEstimate.mockResolvedValueOnce({ data: costEstimate() });

    const result = await runCli(
      [
        "cost",
        "estimate",
        "--keywords",
        "1000",
        "--devices",
        "2",
        "--locations",
        "3",
        "--frequency",
        "weekly",
        "--provider",
        "dataforseo",
        "--option",
        "standard",
      ],
      deps({ env: { BISIBILITY_BASE_URL: "https://api.test/api/v1" } }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("dataforseo");
    expect(result.stdout).toContain("monthly cost usd");
    expect(sdk.BisibilityClient).toHaveBeenCalledWith({ baseUrl: "https://api.test/api/v1" });
    expect(sdk.client.getCostEstimate).toHaveBeenCalledWith({
      devices: 2,
      frequency: "weekly",
      keywords: 1000,
      locations: 3,
      option: "standard",
      provider: "dataforseo",
    });
  });

  it("estimates cost for a plan provider as JSON", async () => {
    sdk.client.getCostEstimate.mockResolvedValueOnce({
      data: costEstimate({
        pricing_model: "plan",
        provider_id: "serpapi",
        selected_option: undefined,
        selected_plan: {
          included_checks: 5000,
          label: "Developer",
          monthly_price_cents: 7500,
          monthly_price_usd: 75,
          plan_key: "developer",
        },
      }),
    });

    const result = await runCli(
      ["cost", "estimate", "--keywords", "0", "--plan", "developer", "--json"],
      deps(),
    );

    expect(JSON.parse(result.stdout).data).toMatchObject({ provider_id: "serpapi" });
    expect(sdk.client.getCostEstimate).toHaveBeenCalledWith({ keywords: 0, plan: "developer" });
  });

  it("lists provider rates as a table and JSON", async () => {
    sdk.client.getProviderRates.mockResolvedValueOnce({
      data: [flatProviderRate(), planProviderRate()],
    });

    const table = await runCli(["cost", "provider-rates"], deps({ env: {} }));
    expect(table.exitCode).toBe(0);
    expect(table.stdout).toContain("dataforseo");
    expect(table.stdout).toContain("standard");
    expect(table.stdout).toContain("serpapi");
    expect(table.stdout).toContain("developer");
    expect(sdk.client.getProviderRates).toHaveBeenCalledWith();

    sdk.client.getProviderRates.mockResolvedValueOnce({ data: [flatProviderRate()] });
    const json = await runCli(["cost", "provider-rates", "--json"], deps());
    expect(JSON.parse(json.stdout).data).toHaveLength(1);
  });

  it("validates cost estimate inputs and subcommands", async () => {
    const missingKeywords = await runCli(["cost", "estimate"], deps());
    expect(missingKeywords.stderr).toContain("cost estimate requires --keywords");

    const badKeywords = await runCli(["cost", "estimate", "--keywords=-5"], deps());
    expect(badKeywords.stderr).toContain("--keywords must be a non-negative integer");

    const fractionalKeywords = await runCli(["cost", "estimate", "--keywords", "1.5"], deps());
    expect(fractionalKeywords.stderr).toContain("--keywords must be a non-negative integer");

    const badFrequency = await runCli(
      ["cost", "estimate", "--keywords", "10", "--frequency", "hourly"],
      deps(),
    );
    expect(badFrequency.stderr).toContain("--frequency must be one of daily, monthly, weekly");

    const badProvider = await runCli(
      ["cost", "estimate", "--keywords", "10", "--provider", "ga4"],
      deps(),
    );
    expect(badProvider.stderr).toContain("--provider must be one of dataforseo, serpapi");

    const zeroDevices = await runCli(
      ["cost", "estimate", "--keywords", "10", "--devices", "0"],
      deps(),
    );
    expect(zeroDevices.stderr).toContain("--devices must be 1 or 2");

    const tooManyDevices = await runCli(
      ["cost", "estimate", "--keywords", "10", "--devices", "3"],
      deps(),
    );
    expect(tooManyDevices.stderr).toContain("--devices must be 1 or 2");

    const fractionalDevices = await runCli(
      ["cost", "estimate", "--keywords", "10", "--devices", "1.5"],
      deps(),
    );
    expect(fractionalDevices.stderr).toContain("--devices must be 1 or 2");

    const badAction = await runCli(["cost"], deps());
    expect(badAction.stderr).toContain("Cost command must be estimate or provider-rates");

    expect(sdk.client.getCostEstimate).not.toHaveBeenCalled();
  });
});

describe("alerts commands", () => {
  it("lists alert rules across pages and triggered alerts", async () => {
    sdk.client.listAlertRules
      .mockResolvedValueOnce(
        list([alertRule({ id: "alr_a10000000000000000000000" })], "next_alerts"),
      )
      .mockResolvedValueOnce(
        list([alertRule({ id: "alr_a20000000000000000000000", name: "SERP feature" })]),
      );
    sdk.client.listTriggeredAlerts.mockResolvedValueOnce(list([triggeredAlert()]));

    const rules = await runCli(
      [
        "alerts",
        "list",
        "--project",
        "prj_a10000000000000000000000",
        "--limit",
        "2",
        "--all",
        "--json",
      ],
      deps(),
    );
    expect(JSON.parse(rules.stdout).data).toHaveLength(2);
    expect(sdk.client.listAlertRules).toHaveBeenNthCalledWith(1, "prj_a10000000000000000000000", {
      limit: 2,
    });
    expect(sdk.client.listAlertRules).toHaveBeenNthCalledWith(2, "prj_a10000000000000000000000", {
      cursor: "next_alerts",
      limit: 2,
    });

    const triggered = await runCli(
      ["alerts", "triggered", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(triggered.stdout).toContain("Keyword left top 10");
    expect(sdk.client.listTriggeredAlerts).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
  });

  it("creates, updates, and deletes alert rules", async () => {
    sdk.client.createAlertRule.mockResolvedValueOnce(alertRule({ enabled: false }));
    sdk.client.updateAlertRule.mockResolvedValueOnce(alertRule({ name: "Updated rule" }));
    sdk.client.deleteAlertRule.mockResolvedValueOnce({ deleted: true });

    const created = await runCli(
      [
        "alerts",
        "create",
        "--project",
        "prj_a10000000000000000000000",
        "--name",
        "Top 10 drop",
        "--condition",
        "threshold",
        "--target-type",
        "keyword",
        "--target-id",
        "kw_a10000000000000000000000",
        "--target-ids",
        "kw_a20000000000000000000000,kw_a30000000000000000000000",
        "--channel",
        "email",
        "--channels",
        "slack,webhook",
        "--threshold-position",
        "10",
        "--disabled",
      ],
      deps(),
    );
    expect(created.stdout).toContain("enabled    no");
    expect(sdk.client.createAlertRule).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      channels: ["email", "slack", "webhook"],
      condition_type: "threshold",
      enabled: false,
      name: "Top 10 drop",
      target_ids: [
        "kw_a10000000000000000000000",
        "kw_a20000000000000000000000",
        "kw_a30000000000000000000000",
      ],
      target_type: "keyword",
      threshold_position: 10,
    });

    const updateInput = JSON.stringify({
      channels: ["email"],
      condition_type: "change_pct",
      name: "Updated rule",
      target_type: "all",
    });
    const updated = await runCli(
      [
        "alerts",
        "update",
        "alr_a10000000000000000000000",
        "--input-json",
        updateInput,
        "--change-pct",
        "25",
        "--json",
      ],
      deps(),
    );
    expect(JSON.parse(updated.stdout)).toMatchObject({ name: "Updated rule" });
    expect(sdk.client.updateAlertRule).toHaveBeenCalledWith("alr_a10000000000000000000000", {
      channels: ["email"],
      change_pct: 25,
      condition_type: "change_pct",
      name: "Updated rule",
      target_type: "all",
    });

    const deleted = await runCli(["alerts", "delete", "alr_a10000000000000000000000"], deps());
    expect(deleted.stdout).toContain("deleted  yes");
    expect(sdk.client.deleteAlertRule).toHaveBeenCalledWith("alr_a10000000000000000000000");

    const invalid = await runCli(["alerts", "create", "--condition", "threshold"], deps());
    expect(invalid.stderr).toContain("alerts create requires --name");
  });

  it("mutes a triggered alert and marks project alerts read", async () => {
    sdk.client.muteTriggeredAlert.mockResolvedValueOnce({
      muted: true,
      snoozed_until: "2026-07-29T10:00:00.000Z",
    });
    sdk.client.markProjectAlertsRead.mockResolvedValueOnce({ updated: 3 });

    const muted = await runCli(
      [
        "alerts",
        "mute",
        "al_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(muted.stdout).toContain("muted");
    expect(muted.stdout).toContain("2026-07-29T10:00:00.000Z");
    expect(sdk.client.muteTriggeredAlert).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "al_a10000000000000000000000",
    );

    const read = await runCli(
      ["alerts", "mark-read", "--project", "prj_a10000000000000000000000", "--json"],
      deps(),
    );
    expect(JSON.parse(read.stdout)).toEqual({ updated: 3 });
    expect(sdk.client.markProjectAlertsRead).toHaveBeenCalledWith("prj_a10000000000000000000000");

    const missing = await runCli(
      ["alerts", "mute", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(missing.stderr).toContain("Pass a triggered alert ID");
  });
});

describe("sitemaps commands", () => {
  it("lists and updates sitemap monitors", async () => {
    sdk.client.listSitemapMonitors.mockResolvedValueOnce(list([sitemapMonitor()]));
    sdk.client.updateSitemapMonitor
      .mockResolvedValueOnce(sitemapMonitor({ enabled: true }))
      .mockResolvedValueOnce(sitemapMonitor({ enabled: false, status: "disabled" }));

    const listed = await runCli(
      ["sitemaps", "list", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(listed.stdout).toContain("https://example.com/sitemap.xml");
    expect(listed.stdout).toContain("42");
    expect(sdk.client.listSitemapMonitors).toHaveBeenCalledWith("prj_a10000000000000000000000");

    const enabled = await runCli(
      [
        "sitemaps",
        "enable",
        "prj_a20000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(enabled.stdout).toContain("enabled");
    expect(sdk.client.updateSitemapMonitor).toHaveBeenNthCalledWith(
      1,
      "prj_a10000000000000000000000",
      "prj_a20000000000000000000000",
      {
        enabled: true,
      },
    );

    const disabled = await runCli(
      ["sitemaps", "disable", "--project", "prj_a10000000000000000000000", "--json"],
      deps(),
    );
    expect(JSON.parse(disabled.stdout)).toMatchObject({ enabled: false, status: "disabled" });
    expect(sdk.client.updateSitemapMonitor).toHaveBeenNthCalledWith(
      2,
      "prj_a10000000000000000000000",
      "prj_a10000000000000000000000",
      {
        enabled: false,
      },
    );

    const invalid = await runCli(
      ["sitemaps", "remove", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(invalid.stderr).toContain("Sitemaps command must be list, enable, or disable");
  });
});

describe("team commands", () => {
  it("lists members and invites, creates invites, and revokes scoped and global invites", async () => {
    sdk.client.listTeamMembers.mockResolvedValueOnce(list([teamMember()]));
    sdk.client.listTeamInvites.mockResolvedValueOnce(list([teamInvite()]));
    sdk.client.createTeamInvite.mockResolvedValueOnce({
      expires_at: "2026-01-08T00:00:00.000Z",
      id: "inv_new000000000000000000000",
      invite_link: "https://bisibility.test/invite/inv_new000000000000000000000",
    });
    sdk.client.revokeTeamInvite.mockResolvedValueOnce({ id: "inv_a10000000000000000000000" });
    sdk.client.revokeTeamInviteById.mockResolvedValueOnce({
      id: "inv_global000000000000000000",
    });

    const members = await runCli(
      ["team", "list", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(members.stdout).toContain("owner@example.com");
    expect(sdk.client.listTeamMembers).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });

    const invites = await runCli(
      ["team", "invites", "--project", "prj_a10000000000000000000000", "--json"],
      deps(),
    );
    expect(JSON.parse(invites.stdout).data[0]).toMatchObject({
      id: "inv_a10000000000000000000000",
    });
    expect(sdk.client.listTeamInvites).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });

    const created = await runCli(
      [
        "team",
        "invite",
        "new@example.com",
        "--project",
        "prj_a10000000000000000000000",
        "--role",
        "viewer",
      ],
      deps(),
    );
    expect(created.stdout).toContain("inv_new000000000000000000000");
    expect(sdk.client.createTeamInvite).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      email: "new@example.com",
      role: "viewer",
    });

    await runCli(
      [
        "team",
        "revoke",
        "inv_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(sdk.client.revokeTeamInvite).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "inv_a10000000000000000000000",
    );

    await runCli(["team", "revoke", "inv_global000000000000000000", "--global"], deps());
    expect(sdk.client.revokeTeamInviteById).toHaveBeenCalledWith("inv_global000000000000000000");
  });

  it("updates and removes members and resends invites", async () => {
    sdk.client.updateTeamMemberRole.mockResolvedValueOnce({
      id: "mbr_a10000000000000000000000",
      role: "admin",
    });
    sdk.client.removeTeamMember.mockResolvedValueOnce({ id: "mbr_a20000000000000000000000" });
    sdk.client.resendTeamInvite.mockResolvedValueOnce({
      expires_at: "2026-07-29T10:00:00.000Z",
      id: "inv_a10000000000000000000000",
      invite_link: "https://bisibility.test/invite/new-token",
    });

    const updated = await runCli(
      [
        "team",
        "set-role",
        "mbr_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
        "--role",
        "admin",
      ],
      deps(),
    );
    const removed = await runCli(
      [
        "team",
        "remove",
        "mbr_a20000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    const resent = await runCli(
      [
        "team",
        "resend-invite",
        "inv_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
        "--json",
      ],
      deps(),
    );

    expect(updated.stdout).toContain("admin");
    expect(removed.stdout).toContain("mbr_a20000000000000000000000");
    expect(JSON.parse(resent.stdout).invite_link).toContain("new-token");
    expect(sdk.client.updateTeamMemberRole).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "mbr_a10000000000000000000000",
      {
        role: "admin",
      },
    );
    expect(sdk.client.removeTeamMember).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "mbr_a20000000000000000000000",
    );
    expect(sdk.client.resendTeamInvite).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "inv_a10000000000000000000000",
    );
  });

  it("supports alternate team mutation output and validates roles", async () => {
    sdk.client.updateTeamMemberRole.mockResolvedValueOnce({
      id: "mbr_a10000000000000000000000",
      role: "viewer",
    });
    sdk.client.removeTeamMember.mockResolvedValueOnce({ id: "mbr_a20000000000000000000000" });
    sdk.client.resendTeamInvite.mockResolvedValueOnce({
      expires_at: "2026-07-29T10:00:00.000Z",
      id: "inv_a10000000000000000000000",
      invite_link: "https://bisibility.test/invite/new-token",
    });

    const updated = await runCli(
      [
        "team",
        "set-role",
        "mbr_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
        "--role",
        "viewer",
        "--json",
      ],
      deps(),
    );
    const removed = await runCli(
      [
        "team",
        "remove",
        "mbr_a20000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
        "--json",
      ],
      deps(),
    );
    const resent = await runCli(
      [
        "team",
        "resend-invite",
        "inv_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    const missingRole = await runCli(
      [
        "team",
        "set-role",
        "mbr_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    const invalidRole = await runCli(
      [
        "team",
        "set-role",
        "mbr_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
        "--role",
        "owner",
      ],
      deps(),
    );
    const badAction = await runCli(
      [
        "team",
        "promote",
        "mbr_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );

    expect(JSON.parse(updated.stdout).role).toBe("viewer");
    expect(JSON.parse(removed.stdout).id).toBe("mbr_a20000000000000000000000");
    expect(resent.stdout).toContain("new-token");
    expect(missingRole.stderr).toContain("Pass --role admin, member, or viewer");
    expect(invalidRole.stderr).toContain("--role must be admin, member, or viewer");
    expect(badAction.stderr).toContain("Team command must be members");
  });
});

describe("providers commands", () => {
  it("lists providers and connects or tests a provider with credentials", async () => {
    sdk.client.listProviders.mockResolvedValueOnce(list([provider()]));
    sdk.client.connectProvider.mockResolvedValueOnce(
      providerConnection({ id: "conn_new000000000000000000000" }),
    );
    sdk.client.testProviderConnection.mockResolvedValueOnce({
      balance: 12.5,
      message: "Credentials work.",
      ok: true,
    });

    const listed = await runCli(
      ["providers", "list", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(listed.stdout).toContain("dataforseo");
    expect(sdk.client.listProviders).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });

    const connected = await runCli(
      [
        "providers",
        "connect",
        "dataforseo",
        "--project",
        "prj_a10000000000000000000000",
        "--login",
        "acct",
        "--secret",
        "sec",
        "--provider-api-key",
        "provider_key",
        "--credential",
        "region=us",
        "--cost-per-check",
        "2.5",
        "--priority",
        "7",
        "--enabled",
        "true",
        "--primary",
      ],
      deps(),
    );
    expect(connected.stdout).toContain("conn_new000000000000000000000");
    expect(sdk.client.connectProvider).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
      {
        cost_per_check: 2.5,
        credentials: { api_key: "provider_key", region: "us" },
        enabled: true,
        login: "acct",
        primary: true,
        priority: 7,
        secret: "sec",
      },
    );

    const tested = await runCli(
      [
        "providers",
        "test",
        "dataforseo",
        "--project",
        "prj_a10000000000000000000000",
        "--provider-api-key",
        "provider_key",
      ],
      deps(),
    );
    expect(tested.stdout).toContain("Credentials work");
    expect(sdk.client.testProviderConnection).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
      {
        credentials: { api_key: "provider_key" },
      },
    );
  });

  it("passes the endpoint credential when connecting and testing providers", async () => {
    sdk.client.connectProvider.mockResolvedValueOnce(
      providerConnection({ id: "conn_plausible000000000000000", provider: "plausible" }),
    );
    sdk.client.testProviderConnection.mockResolvedValueOnce({
      message: "Credentials work.",
      ok: true,
    });

    const connected = await runCli(
      [
        "providers",
        "connect",
        "plausible",
        "--project",
        "prj_a10000000000000000000000",
        "--provider-api-key",
        "plausible_key",
        "--endpoint",
        "https://plausible.example.com",
      ],
      deps(),
    );
    expect(connected.stdout).toContain("conn_plausible000000000000000");
    expect(sdk.client.connectProvider).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "plausible",
      {
        credentials: { api_key: "plausible_key", endpoint: "https://plausible.example.com" },
      },
    );

    await runCli(
      [
        "providers",
        "test",
        "plausible",
        "--project",
        "prj_a10000000000000000000000",
        "--endpoint",
        "https://plausible.example.com",
      ],
      deps(),
    );
    expect(sdk.client.testProviderConnection).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "plausible",
      {
        credentials: { endpoint: "https://plausible.example.com" },
      },
    );
  });

  it("enables, disables, prioritizes, marks primary, and disconnects providers", async () => {
    sdk.client.enableProvider.mockResolvedValueOnce(providerConnection({ enabled: true }));
    sdk.client.disableProvider.mockResolvedValueOnce(providerConnection({ enabled: false }));
    sdk.client.setProviderPriority.mockResolvedValueOnce(providerConnection({ priority: 20 }));
    sdk.client.setPrimaryProvider.mockResolvedValueOnce(providerConnection({ is_primary: true }));
    sdk.client.disconnectProvider.mockResolvedValueOnce({ ok: true });

    await runCli(
      ["providers", "enable", "dataforseo", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    await runCli(
      ["providers", "disable", "dataforseo", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    await runCli(
      ["providers", "priority", "dataforseo", "20", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    await runCli(
      ["providers", "primary", "dataforseo", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    const disconnected = await runCli(
      ["providers", "disconnect", "dataforseo", "--project", "prj_a10000000000000000000000"],
      deps(),
    );

    expect(sdk.client.enableProvider).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
    );
    expect(sdk.client.disableProvider).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
    );
    expect(sdk.client.setProviderPriority).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
      20,
    );
    expect(sdk.client.setPrimaryProvider).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
      true,
    );
    expect(sdk.client.disconnectProvider).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
    );
    expect(disconnected.stdout).toContain("ok  yes");
  });
});

describe("views and competitors commands", () => {
  it("lists, creates, and deletes saved views", async () => {
    sdk.client.listSavedViews.mockResolvedValueOnce(list([savedView()]));
    sdk.client.createSavedView.mockResolvedValueOnce(
      savedView({ id: "viw_new000000000000000000000" }),
    );
    sdk.client.deleteSavedView.mockResolvedValueOnce({ deleted: true });
    sdk.client.deleteSavedViewById.mockResolvedValueOnce({ deleted: false });

    const listed = await runCli(
      ["views", "list", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(listed.stdout).toContain("Top winners");

    const configJson = JSON.stringify({ filters: { tags: ["api"] }, search: "rank" });
    const created = await runCli(
      [
        "views",
        "create",
        "--project",
        "prj_a10000000000000000000000",
        "--name",
        "API view",
        "--config-json",
        configJson,
      ],
      deps(),
    );
    expect(created.stdout).toContain("viw_new000000000000000000000");
    expect(sdk.client.createSavedView).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      config: { filters: { tags: ["api"] }, search: "rank" },
      name: "API view",
    });

    await runCli(
      [
        "views",
        "delete",
        "viw_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(sdk.client.deleteSavedView).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "viw_a10000000000000000000000",
    );

    await runCli(["views", "delete", "viw_global000000000000000000", "--global"], deps());
    expect(sdk.client.deleteSavedViewById).toHaveBeenCalledWith("viw_global000000000000000000");
  });

  it("lists, adds, and removes competitors", async () => {
    sdk.client.listCompetitors.mockResolvedValueOnce({
      data: [competitor()],
      meta: { markets: [], next_cursor: null, suggestions: [] },
    });
    sdk.client.addCompetitor.mockResolvedValueOnce(
      competitor({ id: "cmp_new000000000000000000000" }),
    );
    sdk.client.removeCompetitor.mockResolvedValueOnce({ removed: true });
    sdk.client.removeCompetitorById.mockResolvedValueOnce({ removed: false });

    const listed = await runCli(
      ["competitors", "list", "--project", "prj_a10000000000000000000000", "--json"],
      deps(),
    );
    expect(JSON.parse(listed.stdout).meta).toMatchObject({ markets: [] });

    const added = await runCli(
      [
        "competitors",
        "add",
        "competitor.com",
        "--project",
        "prj_a10000000000000000000000",
        "--label",
        "Competitor",
      ],
      deps(),
    );
    expect(added.stdout).toContain("cmp_new000000000000000000000");
    expect(sdk.client.addCompetitor).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      domain: "competitor.com",
      label: "Competitor",
    });

    await runCli(
      [
        "competitors",
        "remove",
        "cmp_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(sdk.client.removeCompetitor).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "cmp_a10000000000000000000000",
    );

    await runCli(["competitors", "remove", "cmp_global000000000000000000", "--global"], deps());
    expect(sdk.client.removeCompetitorById).toHaveBeenCalledWith("cmp_global000000000000000000");
  });
});

describe("saved keyword commands", () => {
  it("lists, adds, and deletes saved keyword ideas", async () => {
    sdk.client.listSavedKeywords.mockResolvedValueOnce(list([savedKeyword()]));
    sdk.client.createSavedKeywords.mockResolvedValueOnce({
      duplicate_count: 1,
      results: [
        { keyword: "rank tracker", status: "created" },
        { keyword: "already tracked", status: "skipped" },
      ],
      saved_count: 1,
    });
    sdk.client.deleteSavedKeyword.mockResolvedValueOnce({ removed_count: 1 });

    const listed = await runCli(
      ["saved", "list", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(listed.stdout).toContain("rank tracker");

    const added = await runCli(
      [
        "saved",
        "add",
        "rank tracker",
        "already tracked",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(added.stdout).toContain("saved");
    expect(sdk.client.createSavedKeywords).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      keywords: ["rank tracker", "already tracked"],
    });

    const deleted = await runCli(
      [
        "saved",
        "delete",
        "svkw_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(deleted.stdout).toContain("removed");
    expect(sdk.client.deleteSavedKeyword).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "svkw_a10000000000000000000000",
    );
  });

  it("validates required keyword text and saved keyword IDs", async () => {
    const missingKeyword = await runCli(
      ["saved", "add", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(missingKeyword.stderr).toContain("Pass at least one keyword");

    const invalidId = await runCli(
      [
        "saved",
        "delete",
        "kw_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(invalidId.stderr).toContain("svkw_ public ID v3");
    expect(sdk.client.deleteSavedKeyword).not.toHaveBeenCalled();
  });
});

describe("notifications and tokens commands", () => {
  it("gets and updates notification preferences", async () => {
    sdk.client.getNotificationPreferences.mockResolvedValueOnce(notificationPreferences());
    sdk.client.updateNotificationPreferences.mockResolvedValueOnce(
      notificationPreferences({ alert_email: false, alert_slack: true }),
    );

    const prefs = await runCli(
      ["notifications", "prefs", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(prefs.stdout).toContain("alert email");
    expect(sdk.client.getNotificationPreferences).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
    );

    const updated = await runCli(
      [
        "notifications",
        "prefs",
        "set",
        "--project",
        "prj_a10000000000000000000000",
        "--alert-email",
        "false",
        "--alert-slack",
        "true",
      ],
      deps(),
    );
    expect(updated.stdout).toContain("alert slack");
    expect(sdk.client.updateNotificationPreferences).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      {
        alert_email: false,
        alert_slack: true,
      },
    );

    const invalid = await runCli(
      [
        "notifications",
        "prefs",
        "set",
        "--project",
        "prj_a10000000000000000000000",
        "--alert-email",
        "maybe",
      ],
      deps(),
    );
    expect(invalid.stderr).toContain("--alert-email must be true or false");
  });

  it("lists, mints, and revokes migration tokens", async () => {
    sdk.client.listMigrationTokens.mockResolvedValueOnce({
      data: [migrationToken()],
      meta: { import_job: {}, next_cursor: null },
    });
    sdk.client.mintMigrationToken.mockResolvedValueOnce(issuedMigrationToken());
    sdk.client.revokeMigrationToken.mockResolvedValueOnce({
      id: "ferry_a10000000000000000000000",
      revoked_at: "2026-01-02T00:00:00.000Z",
    });
    sdk.client.revokeMigrationTokenById.mockResolvedValueOnce({
      id: "ferry_global000000000000000000",
      revoked_at: "2026-01-02T00:00:00.000Z",
    });

    const listed = await runCli(
      ["tokens", "list", "--project", "prj_a10000000000000000000000"],
      deps(),
    );
    expect(listed.stdout).toContain("ferry_a10000000000000000000000");
    expect(sdk.client.listMigrationTokens).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });

    const minted = await runCli(
      ["tokens", "mint", "--project", "prj_a10000000000000000000000", "--scope", "keywords"],
      deps(),
    );
    expect(minted.stdout).toContain("mig_secret");
    expect(sdk.client.mintMigrationToken).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      scope: "keywords",
    });

    await runCli(
      [
        "tokens",
        "revoke",
        "ferry_a10000000000000000000000",
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(sdk.client.revokeMigrationToken).toHaveBeenCalledWith(
      "prj_a10000000000000000000000",
      "ferry_a10000000000000000000000",
    );

    await runCli(["tokens", "revoke", "ferry_global000000000000000000", "--global"], deps());
    expect(sdk.client.revokeMigrationTokenById).toHaveBeenCalledWith(
      "ferry_global000000000000000000",
    );

    const invalid = await runCli(
      ["tokens", "mint", "--project", "prj_a10000000000000000000000", "--scope", "partial"],
      deps(),
    );
    expect(invalid.stderr).toContain("--scope must be full or keywords");
  });
});

describe("new command validation and JSON output", () => {
  it("uses default list actions for new command families", async () => {
    sdk.client.listAlertRules.mockResolvedValueOnce(list([alertRule()]));
    sdk.client.listTeamMembers.mockResolvedValueOnce(list([teamMember()]));
    sdk.client.listProviders.mockResolvedValueOnce(list([provider()]));
    sdk.client.listSavedViews.mockResolvedValueOnce(list([savedView()]));
    sdk.client.listCompetitors.mockResolvedValueOnce({
      data: [competitor()],
      meta: { markets: [], next_cursor: null, suggestions: [] },
    });
    sdk.client.listMigrationTokens.mockResolvedValueOnce({
      data: [migrationToken()],
      meta: { import_job: {}, next_cursor: null },
    });

    await runCli(["alerts", "--project", "prj_a10000000000000000000000"], deps());
    await runCli(["team", "--project", "prj_a10000000000000000000000"], deps());
    await runCli(["providers", "--project", "prj_a10000000000000000000000"], deps());
    await runCli(["views", "--project", "prj_a10000000000000000000000"], deps());
    await runCli(["competitors", "--project", "prj_a10000000000000000000000"], deps());
    await runCli(["tokens", "--project", "prj_a10000000000000000000000"], deps());

    expect(sdk.client.listAlertRules).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
    expect(sdk.client.listTeamMembers).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
    expect(sdk.client.listProviders).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
    expect(sdk.client.listSavedViews).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
    expect(sdk.client.listCompetitors).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
    expect(sdk.client.listMigrationTokens).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      limit: 50,
    });
  });

  it("prints JSON for new mutation and get paths", async () => {
    sdk.client.createAlertRule.mockResolvedValueOnce(
      alertRule({ id: "alr_json00000000000000000000" }),
    );
    sdk.client.deleteAlertRule.mockResolvedValueOnce({ deleted: true });
    sdk.client.listTriggeredAlerts.mockResolvedValueOnce(list([triggeredAlert()]));
    sdk.client.createTeamInvite.mockResolvedValueOnce({
      expires_at: "2026-01-08T00:00:00.000Z",
      id: "inv_json00000000000000000000",
      invite_link: "https://bisibility.test/invite/inv_json00000000000000000000",
    });
    sdk.client.revokeTeamInvite.mockResolvedValueOnce({ id: "inv_json00000000000000000000" });
    sdk.client.listProviders.mockResolvedValueOnce(list([provider()]));
    sdk.client.connectProvider.mockResolvedValueOnce(
      providerConnection({ id: "conn_json00000000000000000000" }),
    );
    sdk.client.testProviderConnection.mockResolvedValueOnce({ message: "ok", ok: true });
    sdk.client.enableProvider.mockResolvedValueOnce(providerConnection({ enabled: true }));
    sdk.client.disableProvider.mockResolvedValueOnce(providerConnection({ enabled: false }));
    sdk.client.setProviderPriority.mockResolvedValueOnce(providerConnection({ priority: 30 }));
    sdk.client.setPrimaryProvider.mockResolvedValueOnce(providerConnection({ is_primary: false }));
    sdk.client.disconnectProvider.mockResolvedValueOnce({ ok: true });
    sdk.client.listSavedViews.mockResolvedValueOnce(list([savedView()]));
    sdk.client.createSavedView.mockResolvedValueOnce(
      savedView({ id: "viw_json00000000000000000000" }),
    );
    sdk.client.deleteSavedView.mockResolvedValueOnce({ deleted: true });
    sdk.client.addCompetitor.mockResolvedValueOnce(
      competitor({ id: "cmp_json00000000000000000000" }),
    );
    sdk.client.removeCompetitor.mockResolvedValueOnce({ removed: true });
    sdk.client.getNotificationPreferences.mockResolvedValueOnce(notificationPreferences());
    sdk.client.updateNotificationPreferences.mockResolvedValueOnce(
      notificationPreferences({ alert_webhook: true }),
    );
    sdk.client.listMigrationTokens.mockResolvedValueOnce({
      data: [migrationToken()],
      meta: { import_job: {}, next_cursor: null },
    });
    sdk.client.mintMigrationToken.mockResolvedValueOnce(
      issuedMigrationToken({ id: "ferry_json00000000000000000000" }),
    );
    sdk.client.revokeMigrationToken.mockResolvedValueOnce({
      id: "ferry_json00000000000000000000",
      revoked_at: "2026-01-02T00:00:00.000Z",
    });

    const alertCreate = await runCli(
      [
        "alerts",
        "create",
        "--project",
        "prj_a10000000000000000000000",
        "--name",
        "JSON alert",
        "--condition",
        "serp_feature",
        "--serp-feature",
        "ai",
        "--json",
      ],
      deps(),
    );
    expect(JSON.parse(alertCreate.stdout)).toMatchObject({ id: "alr_json00000000000000000000" });
    expect(
      JSON.parse(
        (await runCli(["alerts", "delete", "alr_json00000000000000000000", "--json"], deps()))
          .stdout,
      ),
    ).toMatchObject({ deleted: true });
    expect(
      JSON.parse(
        (
          await runCli(
            ["alerts", "triggered", "--project", "prj_a10000000000000000000000", "--json"],
            deps(),
          )
        ).stdout,
      ).data[0],
    ).toMatchObject({ id: "al_a10000000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "team",
              "invite",
              "json@example.com",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ id: "inv_json00000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "team",
              "revoke",
              "inv_json00000000000000000000",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ id: "inv_json00000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            ["providers", "list", "--project", "prj_a10000000000000000000000", "--json"],
            deps(),
          )
        ).stdout,
      ).data[0],
    ).toMatchObject({ id: "dataforseo" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "providers",
              "connect",
              "dataforseo",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ id: "conn_json00000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "providers",
              "test",
              "dataforseo",
              "--project",
              "prj_a10000000000000000000000",
              "--login",
              "acct",
              "--secret",
              "sec",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ ok: true });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "providers",
              "enable",
              "dataforseo",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ enabled: true });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "providers",
              "disable",
              "dataforseo",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ enabled: false });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "providers",
              "priority",
              "dataforseo",
              "--project",
              "prj_a10000000000000000000000",
              "--priority",
              "30",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ priority: 30 });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "providers",
              "primary",
              "dataforseo",
              "--project",
              "prj_a10000000000000000000000",
              "--off",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ is_primary: false });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "providers",
              "disconnect",
              "dataforseo",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ ok: true });
    expect(
      JSON.parse(
        (
          await runCli(
            ["views", "list", "--project", "prj_a10000000000000000000000", "--json"],
            deps(),
          )
        ).stdout,
      ).data[0],
    ).toMatchObject({ id: "viw_a10000000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "views",
              "create",
              "--project",
              "prj_a10000000000000000000000",
              "--name",
              "JSON view",
              "--config-json",
              '{"filters":{},"search":""}',
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ id: "viw_json00000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "views",
              "delete",
              "viw_json00000000000000000000",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ deleted: true });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "competitors",
              "add",
              "json.com",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ id: "cmp_json00000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "competitors",
              "remove",
              "cmp_json00000000000000000000",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ removed: true });
    expect(
      JSON.parse(
        (
          await runCli(
            ["notifications", "prefs", "--project", "prj_a10000000000000000000000", "--json"],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ project_id: "prj_a10000000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "notifications",
              "prefs",
              "set",
              "--project",
              "prj_a10000000000000000000000",
              "--alert-webhook",
              "true",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ alert_webhook: true });
    expect(
      JSON.parse(
        (
          await runCli(
            ["tokens", "list", "--project", "prj_a10000000000000000000000", "--json"],
            deps(),
          )
        ).stdout,
      ).data[0],
    ).toMatchObject({ id: "ferry_a10000000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            ["tokens", "mint", "--project", "prj_a10000000000000000000000", "--json"],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ id: "ferry_json00000000000000000000" });
    expect(
      JSON.parse(
        (
          await runCli(
            [
              "tokens",
              "revoke",
              "ferry_json00000000000000000000",
              "--project",
              "prj_a10000000000000000000000",
              "--json",
            ],
            deps(),
          )
        ).stdout,
      ),
    ).toMatchObject({ id: "ferry_json00000000000000000000" });

    expect(sdk.client.testProviderConnection).toHaveBeenLastCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
      {
        login: "acct",
        secret: "sec",
      },
    );
    expect(sdk.client.setPrimaryProvider).toHaveBeenLastCalledWith(
      "prj_a10000000000000000000000",
      "dataforseo",
      false,
    );
    expect(sdk.client.mintMigrationToken).toHaveBeenLastCalledWith(
      "prj_a10000000000000000000000",
      {},
    );
  });

  it("validates new command inputs and unknown subcommands", async () => {
    await expect(runCli(["alerts", "create", "--input-json", "[]"], deps())).resolves.toMatchObject(
      {
        stderr: expect.stringContaining("--input-json must be a JSON object"),
      },
    );
    await expect(
      runCli(
        ["alerts", "create", "--name", "Bad", "--condition", "threshold", "--change-pct", "nope"],
        deps(),
      ),
    ).resolves.toMatchObject({
      stderr: expect.stringContaining("--change-pct must be a number"),
    });
    await expect(
      runCli(
        [
          "providers",
          "connect",
          "dataforseo",
          "--project",
          "prj_a10000000000000000000000",
          "--credential",
          "broken",
        ],
        deps(),
      ),
    ).resolves.toMatchObject({
      stderr: expect.stringContaining("--credential must use name=value"),
    });
    await expect(
      runCli(
        ["providers", "priority", "dataforseo", "--project", "prj_a10000000000000000000000"],
        deps(),
      ),
    ).resolves.toMatchObject({
      stderr: expect.stringContaining("Pass a provider priority"),
    });
    await expect(
      runCli(
        [
          "views",
          "create",
          "--project",
          "prj_a10000000000000000000000",
          "--name",
          "Bad",
          "--config-json",
          "{}",
          "--config-file",
          "view.json",
        ],
        deps(),
      ),
    ).resolves.toMatchObject({
      stderr: expect.stringContaining("Pass either --config-json or --config-file"),
    });
    await expect(
      runCli(
        ["views", "create", "--project", "prj_a10000000000000000000000", "--name", "Bad"],
        deps(),
      ),
    ).resolves.toMatchObject({
      stderr: expect.stringContaining("views create requires --config-json or --config-file"),
    });
    await expect(
      runCli(
        ["notifications", "prefs", "set", "--project", "prj_a10000000000000000000000"],
        deps(),
      ),
    ).resolves.toMatchObject({
      stderr: expect.stringContaining("Pass at least one notification preference flag"),
    });
    await expect(runCli(["notifications", "bad"], deps())).resolves.toMatchObject({
      stderr: expect.stringContaining("Notifications command must be prefs"),
    });
    await expect(runCli(["alerts", "bad"], deps())).resolves.toMatchObject({
      stderr: expect.stringContaining("Alerts command must be"),
    });
    await expect(runCli(["team", "bad"], deps())).resolves.toMatchObject({
      stderr: expect.stringContaining("Team command must be"),
    });
    await expect(
      runCli(
        ["providers", "bad", "dataforseo", "--project", "prj_a10000000000000000000000"],
        deps(),
      ),
    ).resolves.toMatchObject({
      stderr: expect.stringContaining("Providers command must be"),
    });
    await expect(runCli(["views", "bad"], deps())).resolves.toMatchObject({
      stderr: expect.stringContaining("Views command must be"),
    });
    await expect(runCli(["competitors", "bad"], deps())).resolves.toMatchObject({
      stderr: expect.stringContaining("Competitors command must be"),
    });
    await expect(runCli(["tokens", "bad"], deps())).resolves.toMatchObject({
      stderr: expect.stringContaining("Tokens command must be"),
    });
  });
});

describe("export command", () => {
  it("exports JSON with keyword history to a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const output = join(dir, "dump.json");
    sdk.client.listKeywords.mockResolvedValueOnce(list([keyword()]));
    sdk.client.listRankChecks.mockResolvedValueOnce(list([rankCheck()]));

    const result = await runCli(
      ["export", "--project", "prj_a10000000000000000000000", "--output", output],
      deps(),
    );

    expect(result.stdout).toBe(`Wrote ${output}\n`);
    const exported = JSON.parse(await readFile(output, "utf8"));
    expect(exported).toMatchObject({
      exported_at: "2026-06-28T10:00:00.000Z",
      project_id: "prj_a10000000000000000000000",
      version: 1,
    });
    expect(exported.keywords).toHaveLength(1);
    expect(exported.rank_checks).toHaveLength(1);
    expect(sdk.client.listRankChecks).toHaveBeenCalledWith("kw_a10000000000000000000000", {
      limit: 200,
    });
  });

  it("exports CSV without history", async () => {
    sdk.client.listKeywords.mockResolvedValueOnce(list([keyword()]));

    const result = await runCli(
      ["export", "--project", "prj_a10000000000000000000000", "--format", "csv", "--no-history"],
      deps(),
    );

    expect(result.stdout).toContain("keyword_id,keyword,project_id");
    expect(result.stdout).toContain(
      "kw_a10000000000000000000000,rank tracker,prj_a10000000000000000000000",
    );
    expect(sdk.client.listRankChecks).not.toHaveBeenCalled();
  });

  it("exports CSV with paginated rank history", async () => {
    sdk.client.listKeywords.mockResolvedValueOnce(list([keyword()]));
    sdk.client.listRankChecks
      .mockResolvedValueOnce(
        list([rankCheck({ id: "check_a10000000000000000000000" })], "cursor_2"),
      )
      .mockResolvedValueOnce(
        list([rankCheck({ id: "check_a20000000000000000000000", position: 3 })]),
      );

    const result = await runCli(
      ["export", "--project", "prj_a10000000000000000000000", "--format", "csv"],
      deps(),
    );

    expect(result.stdout).toContain("check_a10000000000000000000000");
    expect(result.stdout).toContain("check_a20000000000000000000000");
    expect(sdk.client.listRankChecks).toHaveBeenNthCalledWith(2, "kw_a10000000000000000000000", {
      cursor: "cursor_2",
      limit: 200,
    });
  });

  it("rejects invalid export formats and invalid limits", async () => {
    const badFormat = await runCli(["export", "--format", "xml"], deps());
    expect(badFormat.exitCode).toBe(1);
    expect(badFormat.stderr).toContain("--format must be json or csv");

    const badLimit = await runCli(["export", "--history-limit", "0"], deps());
    expect(badLimit.exitCode).toBe(1);
    expect(badLimit.stderr).toContain("--history-limit must be a positive integer");
  });

  it("exports server-generated rank history CSV to stdout and a file", async () => {
    const csv =
      "keyword_id,checked_at,position\nkw_a10000000000000000000000,2026-07-22T08:00:00.000Z,4\n";
    sdk.client.exportRankHistory.mockResolvedValue(csv);

    const stdout = await runCli(
      [
        "export",
        "rank-history",
        "--project",
        "prj_a10000000000000000000000",
        "--range",
        "90",
        "--granularity",
        "weekly",
        "--keyword-id",
        "kw_a10000000000000000000000",
        "--keyword-ids",
        "kw_a20000000000000000000000,kw_a30000000000000000000000",
      ],
      deps(),
    );
    expect(stdout.stdout).toBe(csv);
    expect(sdk.client.exportRankHistory).toHaveBeenNthCalledWith(
      1,
      "prj_a10000000000000000000000",
      {
        format: "csv",
        granularity: "weekly",
        keywordIds: [
          "kw_a10000000000000000000000",
          "kw_a20000000000000000000000",
          "kw_a30000000000000000000000",
        ],
        range: "90",
      },
    );

    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-history-"));
    const output = join(dir, "history.csv");
    const written = await runCli(
      ["export", "rank-history", "--project", "prj_a10000000000000000000000", "--out", output],
      deps(),
    );
    expect(written.stdout).toBe(`Wrote ${output}\n`);
    expect(await readFile(output, "utf8")).toBe(csv);
  });

  it("renders rank history JSON and validates export options", async () => {
    sdk.client.exportRankHistory.mockResolvedValueOnce(
      list([
        {
          checked_at: "2026-07-22T08:00:00.000Z",
          id: "check_a10000000000000000000000",
          keyword: "rank tracker",
          keyword_id: "kw_a10000000000000000000000",
          position: 4,
          previous_position: 8,
          ranking_url: "https://example.com/page",
        },
      ]),
    );

    const result = await runCli(
      [
        "export",
        "rank-history",
        "--project",
        "prj_a10000000000000000000000",
        "--json",
        "--cursor",
        "next_1",
        "--limit",
        "50",
      ],
      deps(),
    );
    expect(JSON.parse(result.stdout).data[0]).toMatchObject({
      checked_at: "2026-07-22T08:00:00.000Z",
      keyword_id: "kw_a10000000000000000000000",
    });
    expect(sdk.client.exportRankHistory).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      cursor: "next_1",
      format: "json",
      limit: 50,
    });

    const badRange = await runCli(["export", "rank-history", "--range", "7"], deps());
    expect(badRange.stderr).toContain("--range must be 30, 90, or all");
    const badGranularity = await runCli(
      ["export", "rank-history", "--granularity", "hourly"],
      deps(),
    );
    expect(badGranularity.stderr).toContain("--granularity must be daily or weekly");
    const badPageSize = await runCli(
      [
        "export",
        "rank-history",
        "--project",
        "prj_a10000000000000000000000",
        "--json",
        "--limit",
        "201",
      ],
      deps(),
    );
    expect(badPageSize.stderr).toContain("--limit must be at most 200");
    const badAction = await runCli(["export", "unknown"], deps());
    expect(badAction.stderr).toContain("Export command must be rank-history or no subcommand");
  });
});

describe("cloud import", () => {
  it("pushes a JSON export package through the SDK with a migration token", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const file = join(dir, "dump.json");
    const pkg = {
      alert_rules: [],
      competitors: [],
      exported_at: "2026-07-29T00:00:00.000Z",
      keywords: [
        {
          device: "desktop",
          id: "kw_a10000000000000000000000",
          keyword: "rank tracker",
          location: "United States",
          rankingHistory: [
            {
              checkedAt: "2026-07-29T00:00:00.000Z",
              position: 4,
              previousPosition: 8,
              rankingUrl: "https://example.com/page",
            },
          ],
          tags: ["api"],
          target_url: "https://example.com/page",
        },
      ],
      notification_preferences: [],
      project_id: "prj_a10000000000000000000000",
      saved_views: [],
      scope: "history",
      version: 5,
    };
    await writeFile(file, JSON.stringify(pkg));
    sdk.client.importCloudExport.mockResolvedValueOnce({
      counts: { keywords: 1 },
      job_id: "imp_a10000000000000000000000",
      state: "done",
    });

    const result = await runCli(
      ["cloud", "import", file, "--token", "mig_token", "--cloud-url", "https://cloud.test"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("job    imp_a10000000000000000000000");
    expect(result.stdout).toContain("state  done");
    // Cross-instance migration: the cloud host is targeted with the migration
    // token as the Bearer credential and the documented /api/v1 server prefix.
    expect(sdk.BisibilityClient).toHaveBeenCalledWith({
      apiKey: "mig_token",
      baseUrl: "https://cloud.test/api/v1",
    });
    expect(sdk.client.importCloudExport).toHaveBeenCalledOnce();
    expect(sdk.client.importCloudExport).toHaveBeenCalledWith(pkg);
  });

  it("previews a dry run without calling the SDK", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const file = join(dir, "dump.json");
    await writeFile(
      file,
      JSON.stringify({
        alert_rules: [],
        competitors: [],
        exported_at: "2026-07-29T00:00:00.000Z",
        keywords: [{ ...keyword(), keyword: "rank tracker", rankingHistory: [] }],
        notification_preferences: [],
        project_id: "prj_a10000000000000000000000",
        saved_views: [],
        scope: "history",
        version: 5,
      }),
    );

    const result = await runCli(
      ["cloud", "import", file, "--token", "mig_token", "--dry-run"],
      deps(),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dry_run: true,
      file: "dump.json",
      keyword_count: 1,
      rank_check_count: 0,
    });
    expect(sdk.client.importCloudExport).not.toHaveBeenCalled();
  });

  it("rejects non-object export packages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const file = join(dir, "dump.json");
    await writeFile(file, JSON.stringify([keyword()]));

    const result = await runCli(
      ["cloud", "import", file, "--token", "mig_token", "--dry-run"],
      deps(),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("JSON export package object");
  });

  it("rejects cloud import package v4 before calling the SDK", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const file = join(dir, "dump-v4.json");
    await writeFile(file, JSON.stringify({ keywords: [], version: 4 }));

    const result = await runCli(
      ["cloud", "import", file, "--token", "mig_token", "--dry-run"],
      deps(),
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Version 4 and older packages are not accepted.");
    expect(sdk.client.importCloudExport).not.toHaveBeenCalled();
  });

  it("requires a migration token and reports cloud import failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const file = join(dir, "dump.json");
    await writeFile(file, JSON.stringify({ keywords: [], version: 5 }));

    const missing = await runCli(["cloud", "import", file], deps({ env: {} }));
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("Migration token is required");

    sdk.client.importCloudExport.mockRejectedValueOnce(
      new BisibilityApiError("failed", {
        body: undefined,
        headers: new Headers(),
        method: "POST",
        problem: { detail: "Token expired" },
        status: 401,
        url: "https://cloud.test/api/v1/cloud/import",
      }),
    );
    const failed = await runCli(["cloud", "import", file, "--token", "mig_token"], deps());
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toBe("Token expired\n");
  });

  it("reads cloud import compatibility without a migration token", async () => {
    sdk.client.getCloudImportCompatibility.mockResolvedValueOnce({
      app_version: "1.2.3",
      latest_migration: "0042",
      schema_versions_supported: [5],
    });

    const result = await runCli(
      ["cloud", "compat", "--cloud-url", "https://cloud.test"],
      deps({ env: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("app version       1.2.3");
    expect(result.stdout).toContain("schema versions   5");
    expect(sdk.BisibilityClient).toHaveBeenCalledWith({ baseUrl: "https://cloud.test/api/v1" });
  });
});

describe("me commands", () => {
  const me = {
    email: "owner@example.com",
    id: "usr_a10000000000000000000000",
    name: "Owner Example",
    projects: [
      { domain: "example.com", id: "prj_a10000000000000000000000", name: "Example", role: "owner" },
    ],
  };

  it("shows and updates the current user", async () => {
    sdk.client.getMe.mockResolvedValueOnce(me);
    const shown = await runCli(["me"], deps());
    expect(shown.stdout).toContain("owner@example.com");
    expect(shown.stdout).toContain("projects  1");

    sdk.client.updateMe.mockResolvedValueOnce({ ...me, name: "New Name" });
    const updated = await runCli(["me", "update", "--name", "New Name", "--json"], deps());
    expect(JSON.parse(updated.stdout).name).toBe("New Name");
    expect(sdk.client.updateMe).toHaveBeenCalledWith({ name: "New Name" });

    const missing = await runCli(["me", "update"], deps());
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain("me update requires --name");
  });

  it("lists, creates, and revokes personal access tokens", async () => {
    sdk.client.listMyTokens.mockResolvedValueOnce(
      list([
        {
          created_at: "2026-01-01T00:00:00.000Z",
          expires_at: null,
          id: "pat_a10000000000000000000000",
          last_used_at: null,
          name: "laptop",
          prefix: "bsb_pat_live_abcd",
          revoked_at: null,
          scope: "read",
        },
      ]),
    );
    const listed = await runCli(["me", "tokens", "list"], deps());
    expect(listed.stdout).toContain("pat_a10000000000000000000000");
    expect(sdk.client.listMyTokens).toHaveBeenCalledWith();

    sdk.client.createMyToken.mockResolvedValueOnce({
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: "2026-04-01T00:00:00.000Z",
      id: "pat_new000000000000000000000",
      last_used_at: null,
      masked_value: "bsb_pat_live_abcd******wxyz",
      name: "ci",
      prefix: "bsb_pat_live_abcd",
      revoked_at: null,
      scope: "write",
      token: "bsb_pat_live_secret",
    });
    const created = await runCli(
      ["me", "tokens", "create", "--name", "ci", "--scope", "write", "--expires", "90"],
      deps(),
    );
    expect(created.stdout).toContain("bsb_pat_live_secret");
    expect(sdk.client.createMyToken).toHaveBeenCalledWith({
      expires_in_days: 90,
      name: "ci",
      scope: "write",
    });

    sdk.client.revokeMyToken.mockResolvedValueOnce({
      created_at: "2026-01-01T00:00:00.000Z",
      expires_at: null,
      id: "pat_a10000000000000000000000",
      last_used_at: null,
      name: "laptop",
      prefix: "bsb_pat_live_abcd",
      revoked_at: "2026-02-01T00:00:00.000Z",
      scope: "read",
    });
    const revoked = await runCli(
      ["me", "tokens", "revoke", "pat_a10000000000000000000000"],
      deps(),
    );
    expect(revoked.stdout).toContain("2026-02-01T00:00:00.000Z");
    expect(sdk.client.revokeMyToken).toHaveBeenCalledWith("pat_a10000000000000000000000");
  });

  it("validates me subcommands and token inputs", async () => {
    const badScope = await runCli(
      ["me", "tokens", "create", "--name", "x", "--scope", "root"],
      deps(),
    );
    expect(badScope.stderr).toContain("--scope must be read, write, or admin");

    const badExpiry = await runCli(
      ["me", "tokens", "create", "--name", "x", "--expires", "7"],
      deps(),
    );
    expect(badExpiry.stderr).toContain("--expires must be 30, 90, 365, or never");

    const badAction = await runCli(["me", "delete"], deps());
    expect(badAction.stderr).toContain("Me command must be show, update, or tokens");
  });
});

describe("discovery commands", () => {
  it("lists capabilities without an API key", async () => {
    sdk.client.getCapabilities.mockResolvedValueOnce({
      data: [
        {
          description: "List keywords",
          input_schema: {},
          name: "keywords.list",
          operationId: "listKeywords",
        },
      ],
    });
    const result = await runCli(["capabilities"], deps({ env: {} }));
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("keywords.list");
    expect(result.stdout).toContain("listKeywords");
  });

  it("prints the OpenAPI document as JSON", async () => {
    sdk.client.getOpenApi.mockResolvedValueOnce({
      info: { title: "Bisibility" },
      openapi: "3.1.0",
      paths: {},
    });
    const result = await runCli(["openapi"], deps({ env: {} }));
    expect(JSON.parse(result.stdout).openapi).toBe("3.1.0");
  });

  it("prints the llms.txt discovery file", async () => {
    sdk.client.getLlmsText.mockResolvedValueOnce("# Bisibility\nDocs.");
    const result = await runCli(["llms-txt"], deps({ env: {} }));
    expect(result.stdout).toBe("# Bisibility\nDocs.\n");
  });
});

describe("CLI hardening", () => {
  it("adds deduplicated keywords from a file and stdin", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-keywords-"));
    const file = join(dir, "keywords.txt");
    await writeFile(file, "# comment\nfrom file\n\nshared\n");
    sdk.client.addKeywords.mockResolvedValue({ created: 2, results: [], skipped: 0 });

    await runCli(
      [
        "keywords",
        "add",
        "shared",
        "positional",
        "--file",
        file,
        "--project",
        "prj_a10000000000000000000000",
      ],
      deps(),
    );
    expect(sdk.client.addKeywords).toHaveBeenLastCalledWith("prj_a10000000000000000000000", {
      keywords: [{ keyword: "shared" }, { keyword: "positional" }, { keyword: "from file" }],
    });

    await runCli(
      ["keywords", "add", "positional", "--file", "-", "--project", "prj_a10000000000000000000000"],
      deps({
        readStdin: async () => "stdin one\n# ignored\npositional\n",
      }),
    );
    expect(sdk.client.addKeywords).toHaveBeenLastCalledWith("prj_a10000000000000000000000", {
      keywords: [{ keyword: "positional" }, { keyword: "stdin one" }],
    });
  });

  it("clears nullable keyword and project-default fields and rejects conflicts", async () => {
    sdk.client.updateKeyword.mockResolvedValue(keyword());
    sdk.client.updateProjectDefaults.mockResolvedValue(projectDefaults());

    await runCli(
      [
        "keywords",
        "update",
        "kw_a10000000000000000000000",
        "--clear-target-url",
        "--clear-intent",
        "--clear-topic",
        "--clear-city",
      ],
      deps(),
    );
    expect(sdk.client.updateKeyword).toHaveBeenCalledWith("kw_a10000000000000000000000", {
      city: null,
      intent: null,
      target_url: null,
      topic: null,
    });

    await runCli(
      [
        "projects",
        "defaults",
        "prj_a10000000000000000000000",
        "--clear-city",
        "--clear-cron-expression",
      ],
      deps(),
    );
    expect(sdk.client.updateProjectDefaults).toHaveBeenCalledWith("prj_a10000000000000000000000", {
      city: null,
      cron_expression: null,
    });

    await expect(
      runCli(
        [
          "keywords",
          "update",
          "kw_a10000000000000000000000",
          "--intent",
          "commercial",
          "--clear-intent",
        ],
        deps(),
      ),
    ).resolves.toMatchObject({ exitCode: 1, stderr: expect.stringContaining("conflicts") });
  });

  it("includes the file name when import JSON is malformed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-import-"));
    const file = join(dir, "broken.json");
    await writeFile(file, "{ broken");

    await expect(
      runCli(
        ["cloud", "import", file, "--dry-run"],
        deps({ env: { BISIBILITY_MIGRATION_TOKEN: "mig_test" } }),
      ),
    ).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("broken.json"),
    });
  });

  it("exports rank-check histories with concurrency five and stable keyword order", async () => {
    const keywords = Array.from({ length: 7 }, (_, index) =>
      keyword({ id: `kw_a${String(index).padStart(23, "0")}`, text: `keyword ${index}` }),
    );
    sdk.client.listKeywords.mockResolvedValue(list(keywords));
    let active = 0;
    let maximum = 0;
    sdk.client.listRankChecks.mockImplementation(async (keywordId: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      const index = Number(keywordId.split("_")[1]);
      await new Promise((resolve) => setTimeout(resolve, (7 - index) * 2));
      active -= 1;
      return list([
        rankCheck({ id: `check_a${String(index).padStart(23, "0")}`, keyword_id: keywordId }),
      ]);
    });

    const result = await runCli(
      ["export", "--project", "prj_a10000000000000000000000", "--format", "json"],
      deps(),
    );
    const document = JSON.parse(result.stdout) as { rank_checks: Array<{ keyword_id: string }> };
    expect(maximum).toBe(5);
    expect(document.rank_checks.map((check) => check.keyword_id)).toEqual(
      keywords.map((item) => item.id),
    );
  });
});

describe("auth status", () => {
  it("uses the managed OAuth host and direct EU API host by default", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-default-login-"));
    const config = join(dir, "config.json");
    oauth.loginWithPkce.mockResolvedValueOnce({
      accessToken: "oauth_access",
      authorizeUrl: "https://bisibility.com/authorize",
    });
    sdk.client.createMyToken.mockResolvedValueOnce({
      expires_at: "2026-10-10T00:00:00.000Z",
      id: "pat_a10000000000000000000000",
      token: "bsb_pat_live_1234567890abcdef",
    });

    const result = await runCli(["auth", "login", "--config", config], {
      cwd: dir,
      env: {},
      homeDir: dir,
    });

    expect(result.exitCode).toBe(0);
    expect(oauth.loginWithPkce).toHaveBeenCalledWith("https://bisibility.com", expect.any(Object));
    expect(sdk.BisibilityClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "oauth_access",
        baseUrl: "https://eu.bisibility.com/api/v1",
      }),
    );
  });

  it("logs in through PKCE exchange and stores the reveal-once PAT", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-login-"));
    const config = join(dir, "config.json");
    oauth.loginWithPkce.mockImplementationOnce(async (_cloudUrl, loginDeps) => {
      loginDeps.onProgress?.("Opening the default browser.\n");
      loginDeps.onProgress?.("Waiting for authorization at https://cloud.test.\n");
      return {
        accessToken: "oauth_access",
        authorizeUrl: "https://cloud.test/authorize",
      };
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            expires_at: "2026-10-10T00:00:00.000Z",
            id: "pat_a10000000000000000000000",
            token: "bsb_pat_live_1234567890abcdef",
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        ),
    );
    sdk.client.createMyToken.mockResolvedValueOnce({
      expires_at: "2026-10-10T00:00:00.000Z",
      id: "pat_a10000000000000000000000",
      token: "bsb_pat_live_1234567890abcdef",
    });

    const result = await runCli(
      [
        "auth",
        "login",
        "--config",
        config,
        "--name",
        "Laptop",
        "--scope",
        "write",
        "--expires",
        "365",
      ],
      deps({
        env: {
          BISIBILITY_BASE_URL: "https://cloud.test/api/v1",
          BISIBILITY_CLOUD_URL: "https://cloud.test",
        },
        fetch: fetchMock,
      }),
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(await readFile(config, "utf8"))).toMatchObject({
      apiKey: "bsb_pat_live_1234567890abcdef",
    });
    expect(oauth.loginWithPkce).toHaveBeenCalledWith(
      "https://cloud.test",
      expect.objectContaining({ fetch: fetchMock }),
    );
    expect(sdk.client.createMyToken).toHaveBeenCalledWith({
      expires_in_days: 365,
      name: "Laptop",
      scope: "write",
    });
    expect(result.stdout).toContain("Authentication succeeded for https://cloud.test.");
    expect(result.stdout).toContain("pat_a10000000000000000000000");
    expect(result.stdout).not.toContain("bsb_pat_live_1234567890abcdef");
    expect(result.stderr).toBe(
      "Opening the default browser.\nWaiting for authorization at https://cloud.test.\n",
    );
  });

  it("streams login progress while keeping JSON stdout to one value", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-login-json-"));
    const config = join(dir, "config.json");
    const progress: string[] = [];
    let finishOauth: () => void = () => undefined;
    const oauthPending = new Promise<void>((resolve) => {
      finishOauth = resolve;
    });
    oauth.loginWithPkce.mockImplementationOnce(async (_cloudUrl, loginDeps) => {
      loginDeps.onProgress?.("Opening the default browser.\n");
      loginDeps.onProgress?.("Waiting for authorization at https://cloud.test.\n");
      await oauthPending;
      return {
        accessToken: "oauth_access",
        authorizeUrl: "https://cloud.test/authorize",
      };
    });
    sdk.client.createMyToken.mockResolvedValueOnce({
      expires_at: "2026-10-10T00:00:00.000Z",
      id: "pat_a10000000000000000000000",
      token: "bsb_pat_live_1234567890abcdef",
    });

    const login = runCli(
      ["auth", "login", "--config", config, "--json"],
      deps({
        env: {
          BISIBILITY_BASE_URL: "https://cloud.test/api/v1",
          BISIBILITY_CLOUD_URL: "https://cloud.test",
        },
        onProgress: (message) => progress.push(message),
      }),
    );
    await vi.waitFor(() => {
      expect(progress.join("")).toContain("Waiting for authorization at https://cloud.test.");
    });

    finishOauth();
    const result = await login;
    expect(JSON.parse(result.stdout)).toEqual({
      configPath: config,
      expiresAt: "2026-10-10T00:00:00.000Z",
      id: "pat_a10000000000000000000000",
      name: expect.any(String),
      scope: "admin",
    });
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("Authentication succeeded");
    expect(result.stdout).not.toContain("bsb_pat_live_1234567890abcdef");
  });

  it("maps SDK problem details during the OAuth token exchange", async () => {
    oauth.loginWithPkce.mockResolvedValue({
      accessToken: "oauth_access",
      authorizeUrl: "https://cloud.test/authorize",
    });
    sdk.client.createMyToken.mockRejectedValueOnce(
      new BisibilityApiError("Forbidden", {
        body: undefined,
        headers: new Headers(),
        method: "POST",
        problem: { detail: "Token creation is not allowed." },
        status: 403,
        url: "https://cloud.test/api/v1/me/tokens",
      }),
    );

    await expect(runCli(["auth", "login"], deps())).resolves.toMatchObject({
      exitCode: 1,
      stderr: "Token creation is not allowed.\n",
    });
  });

  it("clears the local PAT on logout without revoking it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-logout-"));
    const config = join(dir, "config.json");
    await writeFile(config, JSON.stringify({ apiKey: "bsb_pat_live_1234567890abcdef" }));

    const result = await runCli(["auth", "logout", "--config", config], deps({ env: {} }));

    expect(result.exitCode).toBe(0);
    expect(sdk.client.revokeMyToken).not.toHaveBeenCalled();
    expect(result.stdout).toMatch(/revoked\s+no/);
    expect(JSON.parse(await readFile(config, "utf8"))).not.toHaveProperty("apiKey");
  });

  it("revokes the current PAT only when logout receives --revoke", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-logout-revoke-"));
    const config = join(dir, "config.json");
    await writeFile(config, JSON.stringify({ apiKey: "bsb_pat_live_1234567890abcdef" }));
    sdk.client.revokeMyToken.mockResolvedValueOnce({ id: "pat_a10000000000000000000000" });

    const result = await runCli(
      ["auth", "logout", "--revoke", "--config", config],
      deps({ env: {} }),
    );

    expect(result.exitCode).toBe(0);
    expect(sdk.client.revokeMyToken).toHaveBeenCalledWith("current");
    expect(result.stdout).toMatch(/revoked\s+yes/);
    expect(JSON.parse(await readFile(config, "utf8"))).not.toHaveProperty("apiKey");
  });

  it("does not claim to log out an environment-provided credential", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-logout-env-"));
    const config = join(dir, "config.json");
    await writeFile(config, JSON.stringify({ apiKey: "bsb_pat_live_stored1234567890" }));

    const result = await runCli(
      ["auth", "logout", "--config", config],
      deps({ env: { BISIBILITY_API_KEY: "bsb_pat_live_environment123456" } }),
    );

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("BISIBILITY_API_KEY"),
    });
    expect(sdk.client.revokeMyToken).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(config, "utf8"))).toHaveProperty(
      "apiKey",
      "bsb_pat_live_stored1234567890",
    );
  });

  it("refuses to revoke a project API key through auth logout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-logout-project-key-"));
    const config = join(dir, "config.json");
    await writeFile(config, JSON.stringify({ apiKey: "bsb_key_live_1234567890abcdef" }));

    const result = await runCli(
      ["auth", "logout", "--revoke", "--config", config],
      deps({ env: {} }),
    );

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: "--revoke requires a personal access token.\n",
    });
    expect(sdk.client.revokeMyToken).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(config, "utf8"))).toHaveProperty(
      "apiKey",
      "bsb_key_live_1234567890abcdef",
    );
  });

  it("shows identity for a personal token", async () => {
    sdk.client.getHealth.mockResolvedValueOnce({ status: "ok" });
    sdk.client.getMe.mockResolvedValueOnce({
      email: "owner@example.com",
      id: "user_1",
      name: "Owner",
      projects: [
        {
          domain: "example.com",
          id: "prj_a10000000000000000000000",
          name: "Example",
          role: "owner",
        },
      ],
    });

    const result = await runCli(
      ["auth", "status", "--json"],
      deps({ env: { BISIBILITY_API_KEY: "bsb_pat_live_1234567890abcdef" } }),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({
      tokenType: "personal",
      user: { email: "owner@example.com" },
    });
    expect(sdk.client.listProjects).not.toHaveBeenCalled();
  });

  it("checks health and projects when an API key is configured", async () => {
    sdk.client.getHealth.mockResolvedValueOnce({
      checked_at: "2026-01-01T00:00:00.000Z",
      providers: { serp: [] },
      services: { app: "ok", database: "ok" },
      status: "ok",
    });
    sdk.client.listProjects.mockResolvedValueOnce(list([project()]));

    const result = await runCli(["auth", "status", "--json"], deps());

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      authenticated: true,
      health: "ok",
      projects: [{ id: "prj_a10000000000000000000000" }],
    });
  });

  it("can report auth settings without network calls", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "bisibility-cli-no-key-"));
    const result = await runCli(["auth", "status", "--offline"], deps({ env: {}, homeDir }));

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      apiKey: null,
      online: false,
    });
    expect(sdk.client.getHealth).not.toHaveBeenCalled();
  });

  it("prints human readable auth status", async () => {
    sdk.client.getHealth.mockResolvedValueOnce({
      checked_at: "2026-01-01T00:00:00.000Z",
      providers: { serp: [] },
      services: { app: "ok", database: "ok" },
      status: "ok",
    });
    sdk.client.listProjects.mockResolvedValueOnce(list([project()]));

    const result = await runCli(["auth", "status"], deps());

    expect(result.stdout).toMatch(/authenticated\s+yes/);
    expect(result.stdout).toMatch(/projects\s+1/);
    expect(result.stdout).toMatch(/current project\s+prj_a10000000000000000000000/);
    expect(result.stdout).toMatch(/project source\s+inferred/);
  });

  it("rejects invalid auth and config actions", async () => {
    const badAuth = await runCli(["auth", "refresh"], deps());
    expect(badAuth.stderr).toContain("Auth command must be login, logout, or status");

    const badExpiry = await runCli(["auth", "login", "--expires", "7"], deps());
    expect(badExpiry.stderr).toContain("--expires must be 30, 90, 365, or never");

    const badConfig = await runCli(["config", "show", "apiKey"], deps());
    expect(badConfig.stderr).toContain("Config command must be get, set, unset, or path");
  });
});

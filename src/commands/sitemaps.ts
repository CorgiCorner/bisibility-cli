import type { SitemapMonitor } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  resolveProjectId,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function sitemapColumns() {
  return [
    { header: "id", value: (monitor: SitemapMonitor) => monitor.id },
    { header: "status", value: (monitor: SitemapMonitor) => monitor.status },
    { header: "enabled", value: (monitor: SitemapMonitor) => yesNo(monitor.enabled) },
    { header: "sitemap", value: (monitor: SitemapMonitor) => monitor.sitemap_url },
    { header: "urls", value: (monitor: SitemapMonitor) => monitor.latest_snapshot?.url_count },
    {
      header: "last fetched",
      value: (monitor: SitemapMonitor) => monitor.latest_snapshot?.fetched_at,
    },
  ];
}

export async function commandSitemaps(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);

  if (action === "list") {
    const result = await client.sitemapMonitors.list(projectId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderTable(result.data, sitemapColumns());
  }

  if (action === "enable" || action === "disable") {
    const monitorId = rest[1] ? assertPublicId(rest[1], "prj", "Sitemap monitor ID") : projectId;
    const result = await client.sitemapMonitors.update(projectId, monitorId, {
      enabled: action === "enable",
    });
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["monitor", result.id],
          ["status", result.status],
          ["enabled", yesNo(result.enabled)],
          ["sitemap", result.sitemap_url],
        ]);
  }

  throw new CliError("Sitemaps command must be list, enable, or disable.");
}

export const handlers = { default: commandSitemaps };

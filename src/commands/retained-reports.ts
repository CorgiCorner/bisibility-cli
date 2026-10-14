import type { ListRankCheckRunsOptions } from "@bisibility/sdk";
import {
  CliError,
  type CommandContext,
  listOrAll,
  parsePositiveInt,
  required,
  resolveProjectId,
  settingsAndClient,
  writeOrReturn,
} from "../context.js";
import { renderJson, renderTable } from "../format.js";
import { getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

export async function dispatchLocal(ctx: CommandContext, rest: readonly string[]) {
  const [action, monitor, run, target] = rest;
  if (!["history", "results", "listings", "point-history", "export"].includes(action ?? ""))
    throw new CliError(
      "Local command must be history, results, listings, point-history, or export.",
    );
  const monitorId = assertPublicId(
    required(monitor, "Pass a Local monitor ID."),
    "lmn",
    "Local monitor ID",
  );
  const runId =
    action === "history"
      ? undefined
      : assertPublicId(required(run, "Pass a Local run ID."), "lmr", "Local run ID");
  const targetId =
    action === "listings" || action === "point-history"
      ? assertPublicId(required(target, "Pass a Local target ID."), "lmt", "Local target ID")
      : undefined;
  const asOf = getStringFlag(ctx.args, "as-of");
  const from = getStringFlag(ctx.args, "from");
  const to = getStringFlag(ctx.args, "to");
  const cursor = getStringFlag(ctx.args, "cursor");
  if ((from || to || cursor) && action !== "history" && action !== "point-history")
    throw new CliError("History selection requires history or point-history.");
  const selection = { ...(asOf ? { asOf } : {}) };
  const history = {
    ...selection,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(cursor ? { cursor } : {}),
  };
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  if (action === "history")
    return writeOrReturn(
      ctx,
      renderJson(await client.localMonitors.history(projectId, monitorId, history)),
    );
  if (!runId) throw new CliError("Pass a Local run ID.");
  if (action === "results")
    return writeOrReturn(
      ctx,
      renderJson(await client.localMonitors.results(projectId, monitorId, runId, selection)),
    );
  if (action === "listings" && targetId)
    return writeOrReturn(
      ctx,
      renderJson(
        await client.localMonitors.listings(projectId, monitorId, runId, targetId, selection),
      ),
    );
  if (action === "point-history" && targetId)
    return writeOrReturn(
      ctx,
      renderJson(
        await client.localMonitors.pointHistory(projectId, monitorId, runId, targetId, history),
      ),
    );
  const format = getStringFlag(ctx.args, "format") ?? "json";
  if (format !== "json" && format !== "csv")
    throw new CliError("Local export --format must be json or csv.");
  const result =
    format === "csv"
      ? await client.localMonitors.export(projectId, monitorId, runId, {
          ...selection,
          version: "1",
          format: "csv",
        })
      : await client.localMonitors.export(projectId, monitorId, runId, {
          ...selection,
          version: "1",
          format: "json",
        });
  return writeOrReturn(ctx, typeof result === "string" ? result : renderJson(result));
}

export async function dispatchRuns(ctx: CommandContext, rest: readonly string[]) {
  const [action, id] = rest;
  if (action !== "list" && action !== "get")
    throw new CliError("Runs command must be list or get.");
  const runId =
    action === "get"
      ? assertPublicId(required(id, "Pass a rank-check run ID."), "rcr", "Rank-check run ID")
      : undefined;
  const segment = getStringFlag(ctx.args, "segment");
  if (segment && segment !== "history" && segment !== "planned")
    throw new CliError("--segment must be history or planned.");
  const limit = parsePositiveInt(getStringFlag(ctx.args, "limit"), "--limit", 50);
  if (limit > 200) throw new CliError("--limit must be at most 200.");
  const cursor = getStringFlag(ctx.args, "cursor");
  const status = getStringFlag(ctx.args, "status");
  const options: ListRankCheckRunsOptions = {
    limit,
    ...(segment === "history" || segment === "planned" ? { segment } : {}),
    ...(cursor ? { cursor } : {}),
    ...(status ? { status } : {}),
  };
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  if (runId)
    return writeOrReturn(ctx, renderJson(await client.rankChecks.runs.get(projectId, runId)));
  const response = await listOrAll(
    () => client.rankChecks.runs.list(projectId, options),
    (cursor) => client.rankChecks.runs.iterate(projectId, { ...options, cursor }),
    hasFlag(ctx.args, "all"),
  );
  const data = response.data;
  return writeOrReturn(
    ctx,
    hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(data, [
          { header: "id", value: (run) => run.id },
          { header: "status", value: (run) => run.status },
          { header: "outcome", value: (run) => run.outcome },
          { header: "terminal", value: (run) => String(run.terminal) },
          { header: "completed", value: (run) => run.counts.completed },
          { header: "failed", value: (run) => run.counts.failed },
          { header: "deferred", value: (run) => run.counts.deferred },
          { header: "cancelled", value: (run) => run.counts.cancelled },
          { header: "blocked_reason", value: (run) => run.blocked_reason },
        ]),
  );
}

import type { AlertRule, TriggeredAlert, UpdateAlertRuleInput } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  alertRuleInput,
  collectPaginated,
  paginationOptions,
  required,
  resolveProjectId,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function alertRuleColumns() {
  return [
    { header: "id", value: (rule: AlertRule) => rule.id },
    { header: "name", value: (rule: AlertRule) => rule.name },
    { header: "condition", value: (rule: AlertRule) => rule.condition_type },
    { header: "target", value: (rule: AlertRule) => rule.target_type },
    { header: "enabled", value: (rule: AlertRule) => yesNo(rule.enabled) },
    { header: "channels", value: (rule: AlertRule) => rule.channels.join(",") },
  ];
}

export function triggeredAlertColumns() {
  return [
    { header: "id", value: (alert: TriggeredAlert) => alert.id },
    { header: "severity", value: (alert: TriggeredAlert) => alert.severity },
    { header: "headline", value: (alert: TriggeredAlert) => alert.headline },
    { header: "keyword", value: (alert: TriggeredAlert) => alert.keyword },
    { header: "rule", value: (alert: TriggeredAlert) => alert.rule },
    { header: "unread", value: (alert: TriggeredAlert) => yesNo(alert.unread) },
    { header: "when", value: (alert: TriggeredAlert) => alert.when },
  ];
}

export async function commandAlerts(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);

  if (action === "list") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listAlertRules(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, alertRuleColumns());
  }

  if (action === "triggered") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listTriggeredAlerts(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, triggeredAlertColumns());
  }

  if (action === "mute") {
    const alertId = assertPublicId(
      required(rest[1], "Pass a triggered alert ID."),
      "alert",
      "Triggered alert ID",
    );
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.muteTriggeredAlert(projectId, alertId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["muted", yesNo(result.muted)],
          ["snoozed until", result.snoozed_until],
        ]);
  }

  if (action === "mark-read") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.markProjectAlertsRead(projectId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["alerts updated", result.updated]]);
  }

  if (action === "create") {
    const input = alertRuleInput(ctx.args, "alerts create");
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.createAlertRule(projectId, input);
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["rule", result.id],
      ["name", result.name],
      ["condition", result.condition_type],
      ["enabled", yesNo(result.enabled)],
    ]);
  }

  if (action === "update") {
    const ruleId = assertPublicId(
      required(rest[1], "Pass an alert rule ID."),
      "rule",
      "Alert rule ID",
    );
    const input = alertRuleInput(ctx.args, "alerts update") as UpdateAlertRuleInput;
    const result = await client.updateAlertRule(ruleId, input);
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["rule", result.id],
      ["name", result.name],
      ["condition", result.condition_type],
      ["enabled", yesNo(result.enabled)],
    ]);
  }

  if (action === "delete") {
    const ruleId = assertPublicId(
      required(rest[1], "Pass an alert rule ID."),
      "rule",
      "Alert rule ID",
    );
    const result = await client.deleteAlertRule(ruleId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["deleted", yesNo(result.deleted)]]);
  }

  throw new CliError(
    "Alerts command must be list, triggered, mute, mark-read, create, update, or delete.",
  );
}

export const handlers = { default: commandAlerts };

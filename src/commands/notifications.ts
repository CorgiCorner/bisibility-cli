import type { NotificationPreferencesWithSummaries } from "../evidence-fields.js";
import { renderJson, renderKeyValues } from "../format.js";
import { hasFlag } from "../parser.js";

import {
  CliError,
  type CommandContext,
  hasOwnProperties,
  notificationInput,
  resolveProjectId,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function notificationPreferenceRows(preferences: NotificationPreferencesWithSummaries) {
  return [
    ["project", preferences.project_id],
    ["email", preferences.email],
    ["email verification", preferences.email_verification],
    ["alert email", yesNo(preferences.alert_email)],
    ["alert in app", yesNo(preferences.alert_in_app)],
    ["alert slack", yesNo(preferences.alert_slack)],
    ["alert webhook", yesNo(preferences.alert_webhook)],
    ["check email", yesNo(preferences.check_email)],
    ["check in app", yesNo(preferences.check_in_app)],
    ["check notification setting", preferences.check_notification_setting],
    ["check notification top n", preferences.check_notification_top_n],
    ["check notification position move", preferences.check_notification_position_move],
    ["provider incident in app", yesNo(preferences.provider_incident_in_app)],
    ["import email", yesNo(preferences.import_email)],
    ["import in app", yesNo(preferences.import_in_app)],
    ["invite email", yesNo(preferences.invite_email)],
    ["invite in app", yesNo(preferences.invite_in_app)],
  ] satisfies [string, string | number | null | undefined][];
}

export async function commandNotifications(ctx: CommandContext, rest: readonly string[]) {
  if (rest[0] !== "prefs") {
    throw new CliError("Notifications command must be prefs.");
  }
  const action = rest[1] ?? "get";
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);

  if (action === "get") {
    const result = await client.notificationSettings.get(projectId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues(notificationPreferenceRows(result));
  }

  if (action === "set") {
    const input = notificationInput(ctx.args);
    if (!hasOwnProperties(input)) {
      throw new CliError("Pass at least one notification preference flag.");
    }
    if (input.check_in_app !== undefined) {
      ctx.stderr.push(
        "--check-in-app is deprecated and ignored by the API; use --check-notification-setting instead.\n",
      );
    }
    const result: NotificationPreferencesWithSummaries = await client.notificationSettings.update(
      projectId,
      input,
    );
    for (const warning of result.warnings ?? []) {
      ctx.stderr.push(`Warning (${warning.code}, ${warning.field}): ${warning.message}\n`);
    }
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues(notificationPreferenceRows(result));
  }

  throw new CliError("Notifications prefs command must be get or set.");
}

export const handlers = { default: commandNotifications };

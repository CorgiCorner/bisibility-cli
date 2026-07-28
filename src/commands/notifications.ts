import type { NotificationPreferences } from "@bisibility/sdk";
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

export function notificationPreferenceRows(preferences: NotificationPreferences) {
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
    const result = await client.getNotificationPreferences(projectId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues(notificationPreferenceRows(result));
  }

  if (action === "set") {
    const input = notificationInput(ctx.args);
    if (!hasOwnProperties(input)) {
      throw new CliError("Pass at least one notification preference flag.");
    }
    const result = await client.updateNotificationPreferences(projectId, input);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues(notificationPreferenceRows(result));
  }

  throw new CliError("Notifications prefs command must be get or set.");
}

export const handlers = { default: commandNotifications };

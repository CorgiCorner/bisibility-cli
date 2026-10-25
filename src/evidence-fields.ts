import type {
  NotificationPreferences,
  RankCheck,
  UpdateNotificationPreferencesInput,
} from "@bisibility/sdk";

// Narrow additions to the published SDK types; requests and parsing remain SDK-owned.
type CheckNotificationSettingInput = "all" | "important" | "none";
type CheckNotificationSetting = CheckNotificationSettingInput | (string & {});

type NotificationPreferenceFields<Setting> = {
  /** @deprecated Read-only compatibility value, ignored on writes. Use check_notification_setting. */
  check_in_app?: boolean;
  check_notification_setting?: Setting;
  check_notification_top_n?: number;
  check_notification_position_move?: number;
  provider_incident_in_app?: boolean;
};

export type NotificationPreferencesWithSummaries = NotificationPreferences &
  NotificationPreferenceFields<CheckNotificationSetting> & {
    warnings?: { code: string; field: string; message: string }[];
  };

export type NotificationPreferencesPatch = UpdateNotificationPreferencesInput &
  NotificationPreferenceFields<CheckNotificationSettingInput>;

export type RankCheckWithEvidence = RankCheck & {
  comparison_allowed?: false;
  result_completeness?: "complete" | "partial" | "unresolved" | (string & {});
  returned_depth?: number | null;
  // Only the evidence status used in the human view is declared here. JSON retains the full object.
  evidence_projection?: { result: string | null } | null;
};

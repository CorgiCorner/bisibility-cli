import {
  type ConfigFile,
  defaultConfigPath,
  loadSettings,
  normalizeConfigKey,
  readConfigFile,
  redactSecret,
  writeConfigFile,
} from "../config.js";
import { renderJson } from "../format.js";

import { CliError, type CommandContext, required } from "../context.js";
import { assertPublicId } from "../public-id.js";

export async function commandConfig(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "get";
  if (action === "path") {
    return `${defaultConfigPath(ctx.args, ctx.deps)}\n`;
  }
  if (action === "get") {
    const settings = await loadSettings(ctx.args, ctx.deps);
    return renderJson({
      apiKey: redactSecret(settings.apiKey),
      baseUrl: settings.baseUrl,
      cloudUrl: settings.cloudUrl,
      configPath: settings.configPath,
      projectConfigPath: settings.projectConfigPath ?? null,
      projectId: settings.projectId ?? null,
      projectSource: settings.projectSource ?? null,
    });
  }

  const config = await readConfigFile(ctx.args, ctx.deps);
  const key = normalizeConfigKey(required(rest[1], "Pass a config key."));
  if (!key) {
    throw new CliError("Config key must be apiKey, baseUrl, cloudUrl, or projectId.");
  }
  if (action === "set") {
    const value = required(rest[2], "Pass a config value.");
    if (key === "projectId") {
      assertPublicId(value, "prj", "projectId");
    }
    const next: ConfigFile = { ...config, [key]: value };
    const path = await writeConfigFile(ctx.args, next, ctx.deps);
    return `Saved ${key} to ${path}\n`;
  }
  if (action === "unset") {
    const next: ConfigFile = { ...config };
    delete next[key];
    const path = await writeConfigFile(ctx.args, next, ctx.deps);
    return `Removed ${key} from ${path}\n`;
  }

  throw new CliError("Config command must be get, set, unset, or path.");
}

export const handlers = { default: commandConfig };

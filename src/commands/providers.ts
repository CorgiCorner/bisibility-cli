import type { Provider, ProviderConnection, ProviderTestResult } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";

import {
  CliError,
  type CommandContext,
  collectPaginated,
  paginationOptions,
  parseOptionalPositiveInt,
  providerConnectInput,
  providerTestInput,
  required,
  resolveProjectId,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function providerColumns() {
  return [
    { header: "id", value: (provider: Provider) => provider.id },
    { header: "name", value: (provider: Provider) => provider.name },
    { header: "status", value: (provider: Provider) => provider.status },
    { header: "enabled", value: (provider: Provider) => yesNo(provider.enabled) },
    { header: "primary", value: (provider: Provider) => yesNo(provider.primary) },
    { header: "priority", value: (provider: Provider) => provider.priority },
  ];
}

export function providerConnectionSummary(result: ProviderConnection) {
  return renderKeyValues([
    ["connection", result.id],
    ["provider", result.provider],
    ["enabled", yesNo(result.enabled)],
    ["primary", yesNo(result.is_primary)],
    ["priority", result.priority],
    ["status", result.status],
  ]);
}

export function providerTestSummary(result: ProviderTestResult) {
  return renderKeyValues([
    ["ok", yesNo(result.ok)],
    ["message", result.message],
    ["balance", result.balance],
  ]);
}

export function providerConnectionOutput(args: ParsedArgs, result: ProviderConnection) {
  return hasFlag(args, "json") ? renderJson(result) : providerConnectionSummary(result);
}

export function providerTestOutput(args: ParsedArgs, result: ProviderTestResult) {
  return hasFlag(args, "json") ? renderJson(result) : providerTestSummary(result);
}

export async function commandProviders(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);
  const projectId = await resolveProjectId(client, ctx, settings.projectId);
  if (action === "list") {
    const response = await collectPaginated(
      (options) => client.listProviders(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, providerColumns());
  }

  const providerId = required(rest[1], "Pass a provider ID.");
  switch (action) {
    case "connect": {
      const result = await client.connectProvider(
        projectId,
        providerId,
        providerConnectInput(ctx.args),
      );
      return providerConnectionOutput(ctx.args, result);
    }
    case "test": {
      const result = await client.testProviderConnection(
        projectId,
        providerId,
        providerTestInput(ctx.args),
      );
      return providerTestOutput(ctx.args, result);
    }
    case "enable":
    case "disable": {
      const result =
        action === "enable"
          ? await client.enableProvider(projectId, providerId)
          : await client.disableProvider(projectId, providerId);
      return providerConnectionOutput(ctx.args, result);
    }
    case "priority": {
      const priority = parseOptionalPositiveInt(
        rest[2] ?? getStringFlag(ctx.args, "priority"),
        "priority",
      );
      if (priority === undefined) {
        throw new CliError("Pass a provider priority.");
      }
      const result = await client.setProviderPriority(projectId, providerId, priority);
      return providerConnectionOutput(ctx.args, result);
    }
    case "primary": {
      const result = await client.setPrimaryProvider(
        projectId,
        providerId,
        !hasFlag(ctx.args, "off"),
      );
      return providerConnectionOutput(ctx.args, result);
    }
    case "disconnect": {
      const result = await client.disconnectProvider(projectId, providerId);
      return hasFlag(ctx.args, "json")
        ? renderJson(result)
        : renderKeyValues([["ok", yesNo(result.ok)]]);
    }
    default:
      throw new CliError(
        "Providers command must be list, connect, test, enable, disable, priority, primary, or disconnect.",
      );
  }
}

export const handlers = { default: commandProviders };

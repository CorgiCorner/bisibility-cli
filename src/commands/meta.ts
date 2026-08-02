import type { Capability } from "@bisibility/sdk";
import { renderJson, renderTable } from "../format.js";
import { hasFlag } from "../parser.js";

import { type CommandContext, settingsAndClient, writeOrReturn } from "../context.js";

export function capabilityColumns() {
  return [
    { header: "name", value: (capability: Capability) => capability.name },
    { header: "operationId", value: (capability: Capability) => capability.operationId },
    { header: "description", value: (capability: Capability) => capability.description },
  ];
}

export async function commandCapabilities(ctx: CommandContext) {
  const { client } = await settingsAndClient(ctx, false);
  const response = await client.system.getCapabilities();
  return hasFlag(ctx.args, "json")
    ? renderJson(response)
    : renderTable(response.data, capabilityColumns());
}

export async function commandOpenApi(ctx: CommandContext) {
  const { client } = await settingsAndClient(ctx, false);
  const document = await client.system.getOpenApi();
  return writeOrReturn(ctx, renderJson(document));
}

export async function commandLlmsText(ctx: CommandContext) {
  const { client } = await settingsAndClient(ctx, false);
  const text = await client.system.getLlmsText();
  return writeOrReturn(ctx, text.endsWith("\n") ? text : `${text}\n`);
}

export const handlers = {
  capabilities: commandCapabilities,
  llmsText: commandLlmsText,
  openapi: commandOpenApi,
};

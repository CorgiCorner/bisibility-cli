import type {
  CostEstimate,
  CostEstimateFrequency,
  GetCostEstimateOptions,
  ProviderRate,
} from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";

import {
  CliError,
  type CommandContext,
  parseOptionalPositiveInt,
  required,
  settingsAndClient,
  yesNo,
} from "../context.js";

export const COST_ESTIMATE_FREQUENCIES = ["daily", "monthly", "weekly"] as const;
export const COST_ESTIMATE_PROVIDERS = ["dataforseo", "serpapi"] as const;

export function parseCostEstimateFrequency(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (!(COST_ESTIMATE_FREQUENCIES as readonly string[]).includes(value)) {
    throw new CliError(`--frequency must be one of ${COST_ESTIMATE_FREQUENCIES.join(", ")}.`);
  }
  return value as CostEstimateFrequency;
}

export function parseCostEstimateProvider(value: string | undefined) {
  if (value === undefined) return undefined;
  if (!(COST_ESTIMATE_PROVIDERS as readonly string[]).includes(value)) {
    throw new CliError(`--provider must be one of ${COST_ESTIMATE_PROVIDERS.join(", ")}.`);
  }
  return value as NonNullable<GetCostEstimateOptions["provider"]>;
}

export function parseNonNegativeInt(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

export function parseCostEstimateDevices(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2) {
    throw new CliError("--devices must be 1 or 2.");
  }
  return parsed;
}

export function costEstimateInput(args: ParsedArgs): GetCostEstimateOptions {
  const keywords = required(
    getStringFlag(args, "keywords"),
    "cost estimate requires --keywords <count>.",
  );
  const input: GetCostEstimateOptions = {
    keywords: parseNonNegativeInt(keywords, "--keywords"),
  };
  const devices = parseCostEstimateDevices(getStringFlag(args, "devices"));
  const frequency = parseCostEstimateFrequency(getStringFlag(args, "frequency"));
  const locations = parseOptionalPositiveInt(getStringFlag(args, "locations"), "--locations");
  const option = getStringFlag(args, "option");
  const plan = getStringFlag(args, "plan");
  const provider = parseCostEstimateProvider(getStringFlag(args, "provider"));
  if (devices !== undefined) {
    input.devices = devices;
  }
  if (frequency) {
    input.frequency = frequency;
  }
  if (locations !== undefined) {
    input.locations = locations;
  }
  if (option) {
    input.option = option;
  }
  if (plan) {
    input.plan = plan;
  }
  if (provider) {
    input.provider = provider;
  }
  return input;
}

export function costEstimateSummary(estimate: CostEstimate) {
  return renderKeyValues([
    ["provider", estimate.provider_id],
    ["pricing model", estimate.pricing_model],
    ["monthly checks", estimate.monthly_checks],
    ["checks per run", estimate.checks_per_run],
    ["monthly cost usd", estimate.monthly_cost_usd],
    ["cost per check cents", estimate.effective_cost_per_check_cents],
    ["option", estimate.pricing_model === "flat" ? estimate.selected_option?.key : undefined],
    ["plan", estimate.pricing_model === "plan" ? estimate.selected_plan?.plan_key : undefined],
    ["exceeds selected plan", yesNo(estimate.exceeds_selected_plan)],
    ["exceeds largest plan", yesNo(estimate.exceeds_largest_plan)],
    ["rate checked", estimate.rate_checked_at],
  ]);
}

export function providerRateKeys(rate: ProviderRate) {
  return rate.pricing_model === "flat"
    ? rate.options.map((option) => option.key).join(",")
    : rate.plans.map((plan) => plan.plan_key).join(",");
}

export function providerRateColumns() {
  return [
    { header: "provider", value: (rate: ProviderRate) => rate.provider_id },
    { header: "label", value: (rate: ProviderRate) => rate.label },
    { header: "model", value: (rate: ProviderRate) => rate.pricing_model },
    { header: "options", value: (rate: ProviderRate) => providerRateKeys(rate) },
    { header: "checked_at", value: (rate: ProviderRate) => rate.checked_at },
  ];
}

export async function commandCost(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0];
  // Cost endpoints are anonymous, so the client is built without an API key.
  const { client } = await settingsAndClient(ctx, false);

  if (action === "estimate") {
    const result = await client.pricing.estimate(costEstimateInput(ctx.args));
    return hasFlag(ctx.args, "json") ? renderJson(result) : costEstimateSummary(result.data);
  }

  if (action === "provider-rates") {
    const result = await client.pricing.getRates();
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderTable(result.data, providerRateColumns());
  }

  throw new CliError("Cost command must be estimate or provider-rates.");
}

export const handlers = { default: commandCost };

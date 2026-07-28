import type { ActiveMigrationToken, IssuedMigrationToken, MigrationScope } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  collectPaginated,
  paginationOptions,
  required,
  resolveProjectId,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function migrationTokenColumns() {
  return [
    { header: "id", value: (token: ActiveMigrationToken) => token.id },
    { header: "scope", value: (token: ActiveMigrationToken) => token.scope },
    { header: "single_use", value: (token: ActiveMigrationToken) => yesNo(token.single_use) },
    { header: "expires_at", value: (token: ActiveMigrationToken) => token.expires_at },
    { header: "created_by", value: (token: ActiveMigrationToken) => token.created_by?.email },
  ];
}

export function migrationScope(args: ParsedArgs) {
  const scope = getStringFlag(args, "scope");
  if (scope === undefined) {
    return undefined;
  }
  if (scope !== "full" && scope !== "keywords") {
    throw new CliError("--scope must be full or keywords.");
  }
  return scope satisfies MigrationScope;
}

export function issuedMigrationTokenSummary(result: IssuedMigrationToken) {
  return renderKeyValues([
    ["token id", result.id],
    ["scope", result.scope],
    ["single use", yesNo(result.single_use)],
    ["expires", result.expires_at],
    ["token", result.token],
  ]);
}

export async function commandTokens(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);

  if (action === "list") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listMigrationTokens(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, migrationTokenColumns());
  }

  if (action === "mint") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const scope = migrationScope(ctx.args);
    const result = await client.mintMigrationToken(projectId, scope ? { scope } : {});
    return hasFlag(ctx.args, "json") ? renderJson(result) : issuedMigrationTokenSummary(result);
  }

  if (action === "revoke") {
    const tokenId = assertPublicId(
      required(rest[1], "Pass a migration token ID."),
      "mtok",
      "Migration token ID",
    );
    const result = hasFlag(ctx.args, "global")
      ? await client.revokeMigrationTokenById(tokenId)
      : await client.revokeMigrationToken(
          await resolveProjectId(client, ctx, settings.projectId),
          tokenId,
        );
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["token", result.id],
          ["revoked", result.revoked_at],
        ]);
  }

  throw new CliError("Tokens command must be list, mint, or revoke.");
}

export const handlers = { default: commandTokens };

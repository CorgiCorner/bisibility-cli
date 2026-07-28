import type { CreateMyTokenInput, PersonalAccessToken } from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import { CliError, type CommandContext, required, settingsAndClient } from "../context.js";

export function personalAccessTokenColumns() {
  return [
    { header: "id", value: (token: PersonalAccessToken) => token.id },
    { header: "name", value: (token: PersonalAccessToken) => token.name },
    { header: "scope", value: (token: PersonalAccessToken) => token.scope },
    { header: "prefix", value: (token: PersonalAccessToken) => token.prefix },
    { header: "created_at", value: (token: PersonalAccessToken) => token.created_at },
    { header: "expires_at", value: (token: PersonalAccessToken) => token.expires_at },
    { header: "last_used_at", value: (token: PersonalAccessToken) => token.last_used_at },
    { header: "revoked_at", value: (token: PersonalAccessToken) => token.revoked_at },
  ];
}

export function tokenScope(args: ParsedArgs) {
  const scope = getStringFlag(args, "scope");
  if (scope === undefined) {
    return undefined;
  }
  if (scope !== "read" && scope !== "write" && scope !== "admin") {
    throw new CliError("--scope must be read, write, or admin.");
  }
  return scope satisfies CreateMyTokenInput["scope"];
}

export function tokenExpiry(args: ParsedArgs) {
  const expires = getStringFlag(args, "expires");
  if (expires === undefined) {
    return undefined;
  }
  if (expires === "never") {
    return null;
  }
  const days = Number(expires);
  if (![30, 90, 365].includes(days)) {
    throw new CliError("--expires must be 30, 90, 365, or never.");
  }
  return days as 30 | 90 | 365;
}

async function commandMyTokens(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client } = await settingsAndClient(ctx);

  if (action === "list") {
    const response = await client.listMyTokens();
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, personalAccessTokenColumns());
  }

  if (action === "create") {
    const name = required(getStringFlag(ctx.args, "name"), "me tokens create requires --name.");
    const scope = tokenScope(ctx.args);
    const expiresInDays = tokenExpiry(ctx.args);
    const result = await client.createMyToken({
      name,
      ...(scope ? { scope } : {}),
      ...(expiresInDays !== undefined ? { expires_in_days: expiresInDays } : {}),
    });
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["token", result.id],
      ["name", result.name],
      ["scope", result.scope],
      ["expires", result.expires_at],
      ["secret", result.token],
    ]);
  }

  if (action === "revoke") {
    const tokenId = assertPublicId(
      required(rest[1], "Pass a personal access token ID."),
      "pat",
      "Personal access token ID",
    );
    const result = await client.revokeMyToken(tokenId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["token", result.id],
          ["revoked", result.revoked_at],
        ]);
  }

  throw new CliError("Me tokens command must be list, create, or revoke.");
}

export async function commandMe(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "show";

  if (action === "tokens") {
    return commandMyTokens(ctx, rest.slice(1));
  }

  const { client } = await settingsAndClient(ctx);

  if (action === "show") {
    const me = await client.getMe();
    if (hasFlag(ctx.args, "json")) {
      return renderJson(me);
    }
    return renderKeyValues([
      ["id", me.id],
      ["email", me.email],
      ["name", me.name],
      ["projects", me.projects.length],
    ]);
  }

  if (action === "update") {
    const name = required(getStringFlag(ctx.args, "name"), "me update requires --name.");
    const me = await client.updateMe({ name });
    if (hasFlag(ctx.args, "json")) {
      return renderJson(me);
    }
    return renderKeyValues([
      ["id", me.id],
      ["email", me.email],
      ["name", me.name],
    ]);
  }

  throw new CliError("Me command must be show, update, or tokens.");
}

export const handlers = { default: commandMe };

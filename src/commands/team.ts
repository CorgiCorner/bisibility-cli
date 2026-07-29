import type { CreateTeamInviteInput, TeamInvite, TeamMember } from "@bisibility/sdk";
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
} from "../context.js";

export function teamMemberColumns() {
  return [
    { header: "id", value: (member: TeamMember) => member.id },
    { header: "email", value: (member: TeamMember) => member.email },
    { header: "name", value: (member: TeamMember) => member.name },
    { header: "role", value: (member: TeamMember) => member.role_value },
  ];
}

export function teamInviteColumns() {
  return [
    { header: "id", value: (invite: TeamInvite) => invite.id },
    { header: "email", value: (invite: TeamInvite) => invite.email },
    { header: "role", value: (invite: TeamInvite) => invite.role_value },
    { header: "invited", value: (invite: TeamInvite) => invite.invited_label },
    { header: "expires", value: (invite: TeamInvite) => invite.expires_label },
  ];
}

export function inviteRole(args: ParsedArgs) {
  const role = getStringFlag(args, "role") ?? "member";
  if (role !== "admin" && role !== "member" && role !== "viewer") {
    throw new CliError("--role must be admin, member, or viewer.");
  }
  return role satisfies CreateTeamInviteInput["role"];
}

function requiredMemberRole(args: ParsedArgs) {
  const role = required(getStringFlag(args, "role"), "Pass --role admin, member, or viewer.");
  if (role !== "admin" && role !== "member" && role !== "viewer") {
    throw new CliError("--role must be admin, member, or viewer.");
  }
  return role satisfies CreateTeamInviteInput["role"];
}

export async function commandTeam(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "members";
  const { client, settings } = await settingsAndClient(ctx);

  if (action === "members" || action === "list") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listTeamMembers(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, teamMemberColumns());
  }

  if (action === "invites") {
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const response = await collectPaginated(
      (options) => client.listTeamInvites(projectId, options),
      paginationOptions(ctx.args),
      hasFlag(ctx.args, "all"),
    );
    return hasFlag(ctx.args, "json")
      ? renderJson(response)
      : renderTable(response.data, teamInviteColumns());
  }

  if (action === "invite") {
    const email = required(rest[1] ?? getStringFlag(ctx.args, "email"), "Pass an invite email.");
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.createTeamInvite(projectId, { email, role: inviteRole(ctx.args) });
    if (hasFlag(ctx.args, "json")) {
      return renderJson(result);
    }
    return renderKeyValues([
      ["invite", result.id],
      ["expires", result.expires_at],
      ["link", result.invite_link],
    ]);
  }

  if (action === "revoke") {
    const inviteId = assertPublicId(required(rest[1], "Pass an invite ID."), "inv", "Invite ID");
    const result = hasFlag(ctx.args, "global")
      ? await client.revokeTeamInviteById(inviteId)
      : await client.revokeTeamInvite(
          await resolveProjectId(client, ctx, settings.projectId),
          inviteId,
        );
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["invite", result.id]]);
  }

  if (action === "set-role") {
    const memberId = assertPublicId(required(rest[1], "Pass a member ID."), "mbr", "Member ID");
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.updateTeamMemberRole(projectId, memberId, {
      role: requiredMemberRole(ctx.args),
    });
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["member", result.id],
          ["role", result.role],
        ]);
  }

  if (action === "remove") {
    const memberId = assertPublicId(required(rest[1], "Pass a member ID."), "mbr", "Member ID");
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.removeTeamMember(projectId, memberId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([["removed member", result.id]]);
  }

  if (action === "resend-invite") {
    const inviteId = assertPublicId(required(rest[1], "Pass an invite ID."), "inv", "Invite ID");
    const projectId = await resolveProjectId(client, ctx, settings.projectId);
    const result = await client.resendTeamInvite(projectId, inviteId);
    return hasFlag(ctx.args, "json")
      ? renderJson(result)
      : renderKeyValues([
          ["invite", result.id],
          ["expires", result.expires_at],
          ["link", result.invite_link],
        ]);
  }

  throw new CliError(
    "Team command must be members, list, invites, invite, revoke, set-role, remove, or resend-invite.",
  );
}

export const handlers = { default: commandTeam };

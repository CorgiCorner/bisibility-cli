import type {
  Project,
  ProjectDefaults,
  ProjectDefaultsPatch,
  UpdateProjectInput,
} from "@bisibility/sdk";
import { renderJson, renderKeyValues, renderTable } from "../format.js";
import { type ParsedArgs, getStringFlag, hasFlag } from "../parser.js";
import { assertPublicId } from "../public-id.js";

import {
  CliError,
  type CommandContext,
  chooseProject,
  hasOwnProperties,
  parseDevice,
  parseFrequency,
  required,
  resolveProjectId,
  saveGlobalProject,
  settingsAndClient,
  yesNo,
} from "../context.js";

export function projectColumns(currentProjectId?: string) {
  return [
    {
      header: "current",
      value: (project: Project) => (project.id === currentProjectId ? "*" : ""),
    },
    { header: "id", value: (project: Project) => project.id },
    { header: "name", value: (project: Project) => project.name },
    { header: "domain", value: (project: Project) => project.domain },
    { header: "write_mode", value: (project: Project) => project.write_mode },
  ];
}

export function projectSummary(project: Project) {
  return renderKeyValues([
    ["project", project.id],
    ["name", project.name],
    ["domain", project.domain],
    ["write mode", project.write_mode],
    ["created", project.created_at],
    ["updated", project.updated_at],
  ]);
}

export function projectDefaultsSummary(defaults: ProjectDefaults) {
  return renderKeyValues([
    ["project", defaults.project_id],
    ["country", defaults.country],
    ["city", defaults.city],
    ["location key", defaults.location_key],
    ["market source", defaults.source],
    ["device", defaults.device],
    ["serp depth", defaults.serp_depth],
    ["stop on match", yesNo(defaults.serp_stop_on_match)],
    ["frequency", defaults.frequency],
    ["cron", defaults.cron_expression],
    ["jitter minutes", defaults.jitter_minutes],
    ["timezone", defaults.timezone],
    ["next check", defaults.next_check_at],
  ]);
}

export function projectUpdateInput(args: ParsedArgs) {
  const input: UpdateProjectInput = {};
  const name = getStringFlag(args, "name");
  const domain = getStringFlag(args, "domain");
  if (name) {
    input.name = name;
  }
  if (domain) {
    input.domain = domain;
  }
  if (!hasOwnProperties(input)) {
    throw new CliError("projects update requires --name or --domain.");
  }
  return input;
}

export function parseJitterMinutes(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError("--jitter-minutes must be a non-negative integer.");
  }
  return parsed;
}

const projectDefaultsFlags = [
  "country",
  "city",
  "location-key",
  "device",
  "frequency",
  "cron-expression",
  "jitter-minutes",
  "timezone",
  "clear-city",
  "clear-cron-expression",
] as const;

function hasProjectDefaultsFlags(args: ParsedArgs) {
  return projectDefaultsFlags.some((flag) => hasFlag(args, flag));
}

export function projectDefaultsInput(args: ParsedArgs) {
  const input: ProjectDefaultsPatch = {};
  const country = getStringFlag(args, "country");
  const city = getStringFlag(args, "city");
  const locationKey = getStringFlag(args, "location-key");
  const device = parseDevice(getStringFlag(args, "device"));
  const frequency = parseFrequency(getStringFlag(args, "frequency"), "--frequency");
  const cronExpression = getStringFlag(args, "cron-expression");
  const jitterMinutes = parseJitterMinutes(getStringFlag(args, "jitter-minutes"));
  const timezone = getStringFlag(args, "timezone");
  const clearCity = hasFlag(args, "clear-city");
  const clearCronExpression = hasFlag(args, "clear-cron-expression");
  if (city !== undefined && clearCity) {
    throw new CliError("--city conflicts with --clear-city.");
  }
  if (cronExpression !== undefined && clearCronExpression) {
    throw new CliError("--cron-expression conflicts with --clear-cron-expression.");
  }

  if (country) {
    input.country = country;
  }
  if (clearCity) {
    input.city = null;
  } else if (city) {
    input.city = city;
  }
  if (locationKey) {
    input.location_key = locationKey;
  }
  if (device) {
    input.device = device;
  }
  if (frequency) {
    input.frequency = frequency;
  }
  if (clearCronExpression) {
    input.cron_expression = null;
  } else if (cronExpression) {
    input.cron_expression = cronExpression;
  }
  if (jitterMinutes !== undefined) {
    input.jitter_minutes = jitterMinutes;
  }
  if (timezone) {
    input.timezone = timezone;
  }
  if (!hasOwnProperties(input)) {
    throw new CliError("Pass at least one project defaults flag.");
  }
  return input;
}

export function projectCreateInput(args: ParsedArgs) {
  const name = required(getStringFlag(args, "name"), "projects create requires --name.");
  const domain = required(getStringFlag(args, "domain"), "projects create requires --domain.");
  const trackingScope = getStringFlag(args, "tracking-scope");
  if (trackingScope && trackingScope !== "city" && trackingScope !== "country") {
    throw new CliError("--tracking-scope must be city or country.");
  }
  return {
    domain,
    name,
    ...(trackingScope ? { trackingScope: trackingScope as "city" | "country" } : {}),
  };
}

export function projectOutput(args: ParsedArgs, project: Project) {
  return hasFlag(args, "json") ? renderJson(project) : projectSummary(project);
}

export async function commandProjects(ctx: CommandContext, rest: readonly string[]) {
  const action = rest[0] ?? "list";
  const { client, settings } = await settingsAndClient(ctx);
  switch (action) {
    case "list": {
      const response = await client.listProjects();
      const currentProjectId =
        settings.projectId ?? (response.data.length === 1 ? response.data[0]?.id : undefined);
      return hasFlag(ctx.args, "json")
        ? renderJson({
            ...response,
            context: {
              project_id: currentProjectId ?? null,
              source: settings.projectSource ?? (currentProjectId ? "inferred" : null),
            },
          })
        : renderTable(response.data, projectColumns(currentProjectId));
    }
    case "create": {
      const result = await client.createProject(projectCreateInput(ctx.args));
      if (hasFlag(ctx.args, "use")) {
        await saveGlobalProject(ctx, assertPublicId(result.id, "prj", "Created project ID"));
      }
      return projectOutput(ctx.args, result);
    }
    case "current": {
      const projectId = await resolveProjectId(client, ctx, settings.projectId);
      const project = await client.getProject(projectId);
      const source = settings.projectSource ?? "inferred";
      return hasFlag(ctx.args, "json")
        ? renderJson({ project, source })
        : renderKeyValues([
            ["project", project.id],
            ["name", project.name],
            ["domain", project.domain],
            ["source", source],
            ["config", settings.projectConfigPath ?? settings.configPath],
          ]);
    }
    case "switch":
    case "use": {
      const response = await client.listProjects();
      const project = await chooseProject(
        ctx,
        response.data,
        rest[1] ?? getStringFlag(ctx.args, "project"),
      );
      const saved = await saveGlobalProject(ctx, project.id);
      const result = {
        configPath: saved.configPath,
        localOverride: saved.localLink?.path ?? null,
        project,
        source: "global",
      };
      if (hasFlag(ctx.args, "json")) {
        return renderJson(result);
      }
      return renderKeyValues([
        ["current project", project.id],
        ["name", project.name],
        ["domain", project.domain],
        ["config", saved.configPath],
        ["local override", saved.localLink?.path],
      ]);
    }
    case "get": {
      const projectId = rest[1]
        ? assertPublicId(rest[1], "prj", "Project ID")
        : await resolveProjectId(client, ctx, settings.projectId);
      const result = await client.getProject(projectId);
      return projectOutput(ctx.args, result);
    }
    case "update": {
      const projectId = assertPublicId(
        required(rest[1], "Pass a project ID."),
        "prj",
        "Project ID",
      );
      const result = await client.updateProject(projectId, projectUpdateInput(ctx.args));
      return projectOutput(ctx.args, result);
    }
    case "delete": {
      const projectId = assertPublicId(
        required(rest[1], "Pass a project ID."),
        "prj",
        "Project ID",
      );
      const result = await client.deleteProject(projectId);
      return hasFlag(ctx.args, "json")
        ? renderJson(result)
        : renderKeyValues([
            ["deleted", result.id],
            ["name", result.name],
          ]);
    }
    case "defaults": {
      const projectId = assertPublicId(
        required(rest[1], "Pass a project ID."),
        "prj",
        "Project ID",
      );
      const result = hasProjectDefaultsFlags(ctx.args)
        ? await client.updateProjectDefaults(projectId, projectDefaultsInput(ctx.args))
        : await client.getProjectDefaults(projectId);
      return hasFlag(ctx.args, "json") ? renderJson(result) : projectDefaultsSummary(result);
    }
    default:
      throw new CliError(
        "Projects command must be create, list, current, use, get, update, delete, or defaults.",
      );
  }
}

export const handlers = { default: commandProjects };

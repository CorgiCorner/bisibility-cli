import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cloudUrlFromBaseUrl,
  defaultConfigPath,
  findProjectLink,
  loadSettings,
  normalizeConfigKey,
  readConfigFile,
  redactSecret,
  removeProjectLink,
  writeConfigFile,
  writeProjectLink,
} from "../src/config.js";
import { parseArgv } from "../src/parser.js";

describe("config helpers", () => {
  it("resolves config paths from flags, env, home, and cwd", () => {
    const args = parseArgv(["--config", "./local.json"]);
    expect(defaultConfigPath(args, { cwd: "/repo", homeDir: "/home/me" })).toBe("/repo/local.json");

    const envArgs = parseArgv([]);
    expect(
      defaultConfigPath(envArgs, {
        env: { BISIBILITY_CONFIG: "~/env.json" },
        homeDir: "/home/me",
      }),
    ).toBe("/home/me/env.json");
  });

  it("loads settings with env and config precedence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const config = join(dir, "config.json");
    await writeFile(
      config,
      JSON.stringify({
        apiKey: "from_config",
        baseUrl: "https://self-host.test/api/v1",
        projectId: "prj_config000000000000000000",
      }),
    );

    const settings = await loadSettings(parseArgv(["--config", config]), {
      env: { BISIBILITY_API_KEY: "from_env" },
      homeDir: dir,
    });

    expect(settings).toMatchObject({
      apiKey: "from_env",
      apiKeySource: "environment",
      baseUrl: "https://self-host.test/api/v1",
      cloudUrl: "https://self-host.test",
      projectId: "prj_config000000000000000000",
      projectSource: "global",
    });
  });

  it("uses the managed OAuth host and direct EU API host by default", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "bisibility-defaults-"));

    const settings = await loadSettings(parseArgv([]), {
      cwd: homeDir,
      env: {},
      homeDir,
    });

    expect(settings).toMatchObject({
      baseUrl: "https://eu.bisibility.com/api/v1",
      cloudUrl: "https://bisibility.com",
    });
  });

  it.runIf(process.platform !== "win32")(
    "creates the default config directory as 0700 and config file as 0600",
    async () => {
      const homeDir = await mkdtemp(join(tmpdir(), "bisibility-permissions-"));
      const path = await writeConfigFile(
        parseArgv([]),
        { apiKey: "bsb_key_live_test" },
        {
          env: {},
          homeDir,
        },
      );

      expect((await stat(join(homeDir, ".config", "bisibility"))).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    },
  );

  it.runIf(process.platform !== "win32")(
    "repairs loose permissions before overwriting an existing config",
    async () => {
      const directory = await mkdtemp(join(tmpdir(), "bisibility-permissions-"));
      const path = join(directory, "config.json");
      await writeFile(path, JSON.stringify({ apiKey: "old" }), { mode: 0o644 });
      await chmod(path, 0o644);

      await writeConfigFile(parseArgv(["--config", path]), { apiKey: "new" }, { env: {} });

      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ apiKey: "new" });
    },
  );

  it("does not claim POSIX chmod enforcement on Windows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bisibility-windows-permissions-"));
    const path = join(directory, "config.json");
    const chmodSpy = vi.fn<typeof chmod>();

    await writeConfigFile(
      parseArgv(["--config", path]),
      { apiKey: "test" },
      {
        chmod: chmodSpy,
        env: {},
        platform: "win32",
      },
    );

    expect(chmodSpy).not.toHaveBeenCalled();
  });

  it("resolves project precedence from flag, environment, local link, then global config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-context-"));
    const nested = join(dir, "packages", "app");
    const config = join(dir, "global.json");
    await mkdir(join(dir, ".bisibility"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await writeFile(
      join(dir, ".bisibility", "project.json"),
      JSON.stringify({ projectId: "prj_local0000000000000000000" }),
    );
    await writeFile(config, JSON.stringify({ projectId: "prj_global000000000000000000" }));

    const local = await loadSettings(parseArgv(["--config", config]), { cwd: nested, env: {} });
    expect(local).toMatchObject({
      projectId: "prj_local0000000000000000000",
      projectSource: "local",
    });

    const environment = await loadSettings(parseArgv(["--config", config]), {
      cwd: nested,
      env: { BISIBILITY_PROJECT_ID: "prj_env000000000000000000000" },
    });
    expect(environment).toMatchObject({
      projectId: "prj_env000000000000000000000",
      projectSource: "environment",
    });

    const flag = await loadSettings(
      parseArgv(["--config", config, "--project", "prj_flag00000000000000000000"]),
      {
        cwd: nested,
        env: { BISIBILITY_PROJECT_ID: "prj_env000000000000000000000" },
      },
    );
    expect(flag).toMatchObject({
      projectId: "prj_flag00000000000000000000",
      projectSource: "flag",
    });
  });

  it("writes, discovers, ignores, and removes a directory project link", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-link-"));
    const nested = join(dir, "src", "nested");
    await mkdir(nested, { recursive: true });

    const written = await writeProjectLink("prj_linked000000000000000000", { cwd: dir });
    expect(JSON.parse(await readFile(written.path, "utf8"))).toEqual({
      projectId: "prj_linked000000000000000000",
    });
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain(".bisibility/\n");
    await expect(findProjectLink({ cwd: nested })).resolves.toMatchObject({
      path: written.path,
      projectId: "prj_linked000000000000000000",
    });

    await expect(removeProjectLink({ cwd: nested })).resolves.toBe(written.path);
    await expect(findProjectLink({ cwd: nested })).resolves.toBeNull();
    await expect(removeProjectLink({ cwd: nested })).resolves.toBeNull();
  });

  it("keeps an existing gitignore stable and handles a missing trailing newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-gitignore-"));
    const gitignore = join(dir, ".gitignore");
    await writeFile(gitignore, "dist/");

    await writeProjectLink("prj_one000000000000000000000", { cwd: dir });
    expect(await readFile(gitignore, "utf8")).toBe("dist/\n.bisibility/\n");

    await writeProjectLink("prj_two000000000000000000000", { cwd: dir });
    expect(await readFile(gitignore, "utf8")).toBe("dist/\n.bisibility/\n");
  });

  it("recognizes a gitignore entry without a trailing slash", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-gitignore-entry-"));
    const gitignore = join(dir, ".gitignore");
    await writeFile(gitignore, ".bisibility\n");

    await writeProjectLink("prj_one000000000000000000000", { cwd: dir });

    expect(await readFile(gitignore, "utf8")).toBe(".bisibility\n");
  });

  it("rejects invalid directory project links", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-invalid-link-"));
    const linkDirectory = join(dir, ".bisibility");
    const link = join(linkDirectory, "project.json");
    await mkdir(linkDirectory, { recursive: true });

    await writeFile(link, "not-json");
    await expect(findProjectLink({ cwd: dir })).rejects.toThrow("must contain valid JSON");

    await writeFile(link, "[]");
    await expect(findProjectLink({ cwd: dir })).rejects.toThrow("must contain a JSON object");

    await writeFile(link, "{}");
    await expect(findProjectLink({ cwd: dir })).rejects.toThrow("non-empty projectId");
  });

  it("rejects non-object config and ignores unknown values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-"));
    const bad = join(dir, "bad.json");
    await writeFile(bad, "[]");

    await expect(readConfigFile(parseArgv(["--config", bad]), { homeDir: dir })).rejects.toThrow(
      "must contain a JSON object",
    );
  });

  it("normalizes config keys, redacts secrets, and derives cloud URLs", () => {
    expect(normalizeConfigKey("api-key")).toBe("apiKey");
    expect(normalizeConfigKey("project")).toBe("projectId");
    expect(normalizeConfigKey("other")).toBeNull();
    expect(redactSecret(undefined)).toBeNull();
    expect(redactSecret("short")).toBe("configured");
    expect(cloudUrlFromBaseUrl("https://eu.bisibility.com/api/v1")).toBe("https://bisibility.com");
    expect(cloudUrlFromBaseUrl("https://host.test/api/v1")).toBe("https://host.test");
    expect(cloudUrlFromBaseUrl("not a url")).toBe("https://bisibility.com");
  });
});

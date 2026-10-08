import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

const oauth = vi.hoisted(() => ({ loginWithPkce: vi.fn() }));

vi.mock("../src/oauth.js", () => ({ loginWithPkce: oauth.loginWithPkce }));

describe("OAuth login with the published SDK contract", () => {
  beforeEach(() => {
    oauth.loginWithPkce.mockReset();
  });

  it("uses an opaque OAuth bearer token to create and store a CLI credential", async () => {
    const dir = await mkdtemp(join(tmpdir(), "bisibility-cli-oauth-sdk-"));
    const config = join(dir, "config.json");
    const accessToken = "opaque-oauth-access-token";
    let tokenRequestHeaders: Headers | undefined;
    oauth.loginWithPkce.mockResolvedValue({
      accessToken,
      authorizeUrl: "https://cloud.example.com/authorize",
    });
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v1/capabilities") {
        return new Response(JSON.stringify({ apiVersions: ["v1"], data: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/api/v1/me/tokens") {
        tokenRequestHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({
            created_at: "2026-10-07T00:00:00.000Z",
            expires_at: "2026-10-31T00:00:00.000Z",
            last_used_at: null,
            revoked_at: null,
            name: "CLI",
            prefix: "bsb_pat_live_12345678",
            scope: "write",
            masked_value: "bsb_pat_live_12345678...",
            id: "pat_a10000000000000000000000",
            token: "bsb_pat_live_1234567890abcdef",
          }),
          { headers: { "Content-Type": "application/json" }, status: 201 },
        );
      }
      throw new Error(`Unexpected request to ${url.pathname}`);
    });

    const result = await runCli(["auth", "login", "--config", config], {
      cwd: dir,
      env: {
        BISIBILITY_BASE_URL: "https://api.example.com/api/v1",
        BISIBILITY_CLOUD_URL: "https://cloud.example.com",
      },
      fetch,
      homeDir: dir,
    });

    expect(result.exitCode, result.stderr).toBe(0);
    expect(tokenRequestHeaders?.get("Authorization")).toBe(`Bearer ${accessToken}`);
    expect(JSON.parse(await readFile(config, "utf8"))).toMatchObject({
      apiKey: "bsb_pat_live_1234567890abcdef",
    });
  });
});

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { loginWithPkce } from "../src/oauth.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

describe("OAuth PKCE login", () => {
  it("discovers endpoints, validates state, and exchanges the loopback code", async () => {
    let challenge = "";
    let redirectUri = "";
    const server = createServer(async (req, res) => {
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname === "/.well-known/oauth-authorization-server") {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            authorization_endpoint: `${origin}/authorize`,
            token_endpoint: `${origin}/token`,
          }),
        );
        return;
      }
      if (url.pathname === "/authorize") {
        expect(url.searchParams.get("client_id")).toBe("bisibility-cli");
        expect(url.searchParams.get("code_challenge_method")).toBe("S256");
        expect(url.searchParams.get("scope")).toContain("tokens:write");
        challenge = url.searchParams.get("code_challenge") ?? "";
        redirectUri = url.searchParams.get("redirect_uri") ?? "";
        const callback = new URL(redirectUri);
        callback.searchParams.set("code", "authorization-code");
        callback.searchParams.set("state", url.searchParams.get("state") ?? "");
        res.writeHead(302, { Location: callback.toString() }).end();
        return;
      }
      if (url.pathname === "/token") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const form = new URLSearchParams(body);
        expect(form.get("grant_type")).toBe("authorization_code");
        expect(form.get("redirect_uri")).toBe(redirectUri);
        expect(
          createHash("sha256")
            .update(form.get("code_verifier") ?? "")
            .digest("base64url"),
        ).toBe(challenge);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ access_token: "opaque-access-token", token_type: "Bearer" }));
        return;
      }
      res.writeHead(404).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

    const result = await loginWithPkce(origin, {
      openBrowser: async (url) => {
        const response = await fetch(url);
        expect(response.status).toBe(200);
      },
      timeoutMs: 5_000,
    });

    expect(result.accessToken).toBe("opaque-access-token");
    expect(new URL(result.authorizeUrl).searchParams.get("redirect_uri")).toMatch(
      /^http:\/\/127\.0\.0\.1:897[6-9]\/callback$/,
    );
  });

  it("rejects hostile loopback requests without aborting a valid login", async () => {
    const server = createServer(async (req, res) => {
      const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname === "/.well-known/oauth-authorization-server") {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            authorization_endpoint: `${origin}/authorize`,
            token_endpoint: `${origin}/token`,
          }),
        );
        return;
      }
      if (url.pathname === "/token") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ access_token: "opaque-access-token" }));
        return;
      }
      res.writeHead(404).end();
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

    const result = await loginWithPkce(origin, {
      openBrowser: async (authorizeUrl) => {
        const authorization = new URL(authorizeUrl);
        const redirectUri = authorization.searchParams.get("redirect_uri");
        const state = authorization.searchParams.get("state");
        expect(redirectUri).not.toBeNull();
        expect(state).not.toBeNull();
        if (!redirectUri || !state) throw new Error("OAuth URL did not include callback state.");

        const hostileOrigin = new URL(redirectUri);
        hostileOrigin.searchParams.set("code", "hostile-code");
        hostileOrigin.searchParams.set("state", state);
        expect(
          await fetch(hostileOrigin, { headers: { Origin: "https://attacker.example" } }),
        ).toMatchObject({ status: 403 });

        expect(await fetch(hostileOrigin, { method: "POST" })).toMatchObject({ status: 405 });

        const wrongState = new URL(hostileOrigin);
        wrongState.searchParams.set("state", "wrong-state");
        expect(await fetch(wrongState)).toMatchObject({ status: 400 });

        const valid = new URL(hostileOrigin);
        valid.searchParams.set("code", "authorization-code");
        expect(await fetch(valid, { headers: { Origin: origin } })).toMatchObject({ status: 200 });
      },
      timeoutMs: 5_000,
    });

    expect(result.accessToken).toBe("opaque-access-token");
  });
});

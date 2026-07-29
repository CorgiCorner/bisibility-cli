import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { type Server, createServer } from "node:http";
import { platform } from "node:os";

const LOOPBACK_PORTS = [8976, 8977, 8978, 8979] as const;
const CALLBACK_PATH = "/callback";
const CLIENT_ID = "bisibility-cli";
const SCOPES = ["openid", "profile", "email", "tokens:write"] as const;

export type OAuthLoginDeps = {
  fetch?: typeof globalThis.fetch;
  onProgress?: (message: string) => void;
  openBrowser?: (url: string) => Promise<void>;
  timeoutMs?: number;
};

type AuthorizationServerMetadata = {
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
};

type CallbackResult = { code: string } | { error: string };

function base64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function execFilePromise(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => (error ? reject(error) : resolve()));
  });
}

async function defaultOpenBrowser(url: string) {
  if (platform() === "darwin") {
    return execFilePromise("open", [url]);
  }
  if (platform() === "win32") {
    return execFilePromise("cmd", ["/c", "start", "", url]);
  }
  return execFilePromise("xdg-open", [url]);
}

function listen(server: Server, port: number) {
  return new Promise<boolean>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(true);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "127.0.0.1");
  });
}

async function loopbackServer(
  state: string,
  timeoutMs: number,
  allowedOrigins: ReadonlySet<string>,
) {
  let settle: (result: CallbackResult) => void = () => undefined;
  let port: number | null = null;
  const callback = new Promise<CallbackResult>((resolve) => {
    settle = resolve;
  });
  const server = createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405, { Allow: "GET" }).end("Method not allowed");
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404).end("Not found");
      return;
    }
    if (port === null || req.headers.host !== `127.0.0.1:${port}`) {
      res.writeHead(400).end("Invalid callback host.");
      return;
    }
    // Browser navigations normally omit Origin. If a caller sends it, only the
    // configured cloud and discovered authorization-server origins are trusted.
    const origin = req.headers.origin;
    if (origin !== undefined && (origin === "null" || !allowedOrigins.has(origin))) {
      res.writeHead(403).end("Invalid callback origin.");
      return;
    }
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (returnedState !== state) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("State mismatch.");
      return;
    }
    if (error) {
      const description = url.searchParams.get("error_description");
      res
        .writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
        .end("Authorization failed.");
      settle({ error: description ? `${error}: ${description}` : error });
      return;
    }
    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Missing code.");
      settle({ error: "OAuth callback did not include an authorization code." });
      return;
    }
    res
      .writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Bisibility CLI authorization complete. You can close this window.");
    settle({ code });
  });

  for (const candidate of LOOPBACK_PORTS) {
    if (await listen(server, candidate)) {
      port = candidate;
      break;
    }
  }
  if (port === null) {
    server.close();
    throw new Error(`Could not bind a loopback callback on ports ${LOOPBACK_PORTS.join(", ")}.`);
  }

  const timer = setTimeout(() => settle({ error: "OAuth login timed out." }), timeoutMs);
  timer.unref();
  return {
    callback: callback.finally(() => {
      clearTimeout(timer);
      server.close();
    }),
    close: () => {
      clearTimeout(timer);
      server.close();
    },
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
  };
}

function requiredEndpoint(value: unknown, name: string, cloudUrl: string) {
  if (typeof value !== "string" || !value) {
    throw new Error(`OAuth discovery did not include ${name}.`);
  }
  return new URL(value, cloudUrl).toString();
}

export async function loginWithPkce(cloudUrl: string, deps: OAuthLoginDeps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new Error("No fetch implementation is available.");

  const metadataUrl = new URL("/.well-known/oauth-authorization-server", cloudUrl).toString();
  const metadataResponse = await fetchImpl(metadataUrl);
  if (!metadataResponse.ok) {
    throw new Error(`OAuth discovery failed with status ${metadataResponse.status}.`);
  }
  const metadata = (await metadataResponse.json()) as AuthorizationServerMetadata;
  const authorizationEndpoint = requiredEndpoint(
    metadata.authorization_endpoint,
    "authorization_endpoint",
    cloudUrl,
  );
  const tokenEndpoint = requiredEndpoint(metadata.token_endpoint, "token_endpoint", cloudUrl);

  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const allowedOrigins = new Set([new URL(cloudUrl).origin, new URL(authorizationEndpoint).origin]);
  const loopback = await loopbackServer(state, deps.timeoutMs ?? 5 * 60 * 1000, allowedOrigins);
  const authorizeUrl = new URL(authorizationEndpoint);
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge(verifier));
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("redirect_uri", loopback.redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", SCOPES.join(" "));
  authorizeUrl.searchParams.set("state", state);
  const authorizationUrl = authorizeUrl.toString();

  deps.onProgress?.("Opening the default browser for Bisibility authentication.\n");
  deps.onProgress?.(`Authorization URL: ${authorizationUrl}\n`);
  try {
    await (deps.openBrowser ?? defaultOpenBrowser)(authorizationUrl);
  } catch {
    deps.onProgress?.(
      "Could not open the default browser. Open the authorization URL above manually.\n",
    );
  }
  deps.onProgress?.(`Waiting for authorization at ${new URL(cloudUrl).origin}.\n`);
  const callback = await loopback.callback;
  if ("error" in callback) throw new Error(callback.error);

  const tokenResponse = await fetchImpl(tokenEndpoint, {
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code: callback.code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: loopback.redirectUri,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = (await tokenResponse.json()) as {
    access_token?: unknown;
    error_description?: unknown;
  };
  if (!tokenResponse.ok || typeof payload.access_token !== "string") {
    const detail =
      typeof payload.error_description === "string"
        ? payload.error_description
        : `OAuth token exchange failed with status ${tokenResponse.status}.`;
    throw new Error(detail);
  }

  return { accessToken: payload.access_token, authorizeUrl: authorizationUrl };
}

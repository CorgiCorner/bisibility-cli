# @bisibility/cli

> Part of [bisibility](https://github.com/CorgiCorner/bisibility) - open-source keyword
> rank tracking you can self-host and automate. This repository contains the command-line
> interface for the Bisibility REST API.
>
> [Docs](https://bisibility.com/docs) ·
> [API reference](https://bisibility.com/docs/api/overview) ·
> [Roadmap](https://bisibility.com/roadmap)
>
> **Status:** Developer preview.

Command-line access to Bisibility projects, keywords, rank checks, analytics, alerts, and
administration.

## Install

Install the published package:

```sh
npm install -g @bisibility/cli
```

Check for an update without changing the installation, or upgrade through the detected global
package manager:

```sh
bisibility upgrade --check
bisibility upgrade
```

The CLI checks npm for a newer stable release at most once per day while an interactive command is
running. A cached notification is printed to stderr after successful command output. Checks are
suppressed for JSON output, help, version output, CI, and non-interactive sessions. Set
`BISIBILITY_NO_UPDATE_CHECK=1` or the conventional `NO_UPDATE_NOTIFIER=1` to disable them. The
upgrade command supports npm, pnpm, and Bun; when the installation method cannot be identified, it
prints manual commands without changing the installation. Yarn Classic installations also use this
manual fallback to avoid creating a second global installation with another package manager.

To work on the CLI from source:

```sh
git clone https://github.com/CorgiCorner/bisibility-cli.git
cd bisibility-cli
npm install
npm run check
npm link
```

## Quickstart

Sign in, select a project, and run the first keyword workflow:

```sh
bisibility auth login
bisibility projects list
bisibility projects use example.com

bisibility keywords add "rank tracker api" \
  --device desktop \
  --country "United States" \
  --target-url https://example.com/rank-tracker \
  --tag api

bisibility keywords list --limit 50
```

`projects use` accepts an exact project name, domain, or public project ID. Once selected, the
project becomes the default for commands that need one. Pass `--project <project-id>` to override
it for a single command.

Run `bisibility --help` for the complete command list and
`bisibility <command> --help` for command-specific options.

## Authentication and configuration

The CLI checks credentials in this order:

1. `BISIBILITY_API_KEY`
2. the config file

The API base URL defaults to `https://eu.bisibility.com/api/v1`.

For Bisibility Cloud, use OAuth Authorization Code with PKCE:

```sh
bisibility auth login
bisibility auth status
bisibility auth logout
```

Login opens the browser and creates a personal access token. By default, the token is named
`CLI on <hostname>` and expires after 90 days. Use `--scope read|write|admin`, `--name`, and
`--expires 30|90|365|never` to change those defaults.

`auth logout` removes the credential from the local config without revoking it. Use
`bisibility auth logout --revoke` when you also want to invalidate the active personal access
token on the server. Credentials supplied through `--api-key` or `BISIBILITY_API_KEY` must be
removed from the command or environment explicitly.

On a headless machine, create a PAT at
[bisibility.com/app/account/security](https://bisibility.com/app/account/security), then store it:

```sh
bisibility config set apiKey bsb_pat_live_...
bisibility config set baseUrl https://eu.bisibility.com/api/v1
bisibility config get
```

Environment variables take precedence over stored values:

```sh
export BISIBILITY_API_KEY=bsb_key_live_...
export BISIBILITY_BASE_URL=https://eu.bisibility.com/api/v1
```

## Self-hosted authentication

Install the published CLI and configure both URLs before signing in:

```sh
npm install -g @bisibility/cli

bisibility config set baseUrl https://rank.example.com/api/v1
bisibility config set cloudUrl https://rank.example.com
bisibility auth login
bisibility auth status
bisibility projects list
bisibility projects use example.com
```

`cloudUrl` is the Bisibility app origin that serves the browser authorization flow. `baseUrl` is
the REST API root and includes `/api/v1`; do not append that path to `cloudUrl`. During login, the
browser returns to a temporary loopback listener on the machine running the CLI. If that machine
cannot open a browser automatically, open the authorization URL printed by the CLI manually in a
browser on that same machine. For truly headless machines, use the environment-variable flow below.

For headless automation, provide a personal or project credential directly and set both self-host
URLs in the environment:

```sh
export BISIBILITY_API_KEY=bsb_pat_live_...
export BISIBILITY_BASE_URL=https://rank.example.com/api/v1
export BISIBILITY_CLOUD_URL=https://rank.example.com

bisibility auth status
bisibility projects use example.com
```

Project selection follows this order:

1. `--project <id>` or `-p <id>`
2. `BISIBILITY_PROJECT_ID`
3. the nearest `.bisibility/project.json` directory link
4. the global `projectId` in the config file
5. automatic inference when the credential can access exactly one project

Link a repository to a project when you want a directory-specific default:

```sh
cd ~/src/example.com
bisibility link example.com
bisibility projects current
bisibility unlink
```

`bisibility link` writes a non-secret `.bisibility/project.json` file and adds its directory to
`.gitignore`.

The default config path is `~/.config/bisibility/config.json`. Use `--config <path>` or
`BISIBILITY_CONFIG` to select another file. Credentials are stored as plaintext JSON. On POSIX
systems, the CLI protects the default directory with mode `0700` and the file with mode `0600`.
Prefer environment variables in managed CI environments.

## Public IDs

Resource IDs use public ID v3: a lowercase resource prefix, an underscore, and a 24-character
lowercase alphanumeric suffix. For example:

- project: `prj_a1b2c3d4e5f6g7h8j9k0m2n3`
- keyword: `kw_b2c3d4e5f6g7h8j9k0m2n3p4`

The CLI rejects raw database IDs, legacy IDs, mixed-case values, and IDs with the wrong resource
prefix before sending a request. Commands document ID arguments as `<project-id>`, `<keyword-id>`,
and similar placeholders so examples stay readable.

Locations are different: use a `location_key` returned by `bisibility locations search`. Location
resource IDs are not supported.

## Common workflows

The examples below assume a default project selected with `bisibility projects use`.

### Keywords and rank checks

Set `KEYWORD_ID` and `CHECK_ID` to IDs returned by the preceding list and check commands.

```sh
bisibility keywords add "rank tracker" "seo monitor" --country Poland --city Krakow
bisibility keywords list --all --json
bisibility keywords research "rank tracker" --estimate --max-cost 6
bisibility keywords metrics --file keywords.txt --json

bisibility keywords get "$KEYWORD_ID"
bisibility keywords update "$KEYWORD_ID" --frequency weekly
bisibility check "$KEYWORD_ID" --async
bisibility check get "$CHECK_ID"
```

Use `keywords add --file <path>` for one keyword per line, or `--file -` for stdin. Blank lines
and lines beginning with `#` are ignored.

Research and uncached metrics can spend the project's DataForSEO budget. Use `--estimate` before
paid lookups and `--max-cost <cents>` as a best-effort request guard.

`check --async` returns a running check immediately. Fetch it later with `check get`.

### Locations, analytics, and signals

```sh
bisibility locations search "warsaw" --country PL --limit 10 --json
bisibility analytics traffic-snapshots --start-date 2026-07-01 --end-date 2026-07-07
bisibility analytics sync --idempotency-key sync-2026-07-07
bisibility signals create --source deploy --type deploy.completed --severity info
bisibility signals list --source deploy --all
```

`--country` and `--location` both set the market country; `--location` takes precedence. Use
`--city` for city-level targeting or `--location-key` for a canonical market key.

Signal payloads must be JSON objects no larger than 8KB after serialization. Writable signal
sources are `api`, `cms`, and `deploy`.

### Projects and automation

```sh
bisibility projects create --name "Example" --domain example.com --use
bisibility projects defaults --country Poland --frequency daily
bisibility export --format json --output dump.json
bisibility cloud import dump.json --token mig_... --dry-run
```

Use `bisibility cloud compat` to check import compatibility before sending an export package.
Migration tokens can also come from `BISIBILITY_MIGRATION_TOKEN`.

## Command groups

| Group | Purpose |
| --- | --- |
| `auth`, `config`, `link`, `unlink` | Authentication and local project selection |
| `projects`, `keywords`, `check` | Core rank-tracking workflows |
| `backlinks`, `analytics`, `signals` | Research, traffic analytics, and events |
| `cost`, `locations` | Public cost estimates and location discovery |
| `alerts`, `sitemaps` | Alert rules, triggered alerts, and sitemap monitoring |
| `providers`, `competitors`, `views` | Data providers and project configuration |
| `team`, `notifications` | Collaboration and notification preferences |
| `api-keys`, `me`, `tokens` | API keys, personal tokens, and migration tokens |
| `export`, `cloud` | Rank-history export and cloud migration |
| `capabilities`, `openapi`, `llms-txt` | Machine-readable API discovery |

Administrative commands require a credential with the matching scope. The create commands for API
keys, personal tokens, and migration tokens print raw credentials once. Store them securely.

## Global options

```text
--api-key <key>          API key, defaults to BISIBILITY_API_KEY or config
--base-url <url>         API v1 base URL, defaults to BISIBILITY_BASE_URL or config
--cloud-url <url>        Cloud host, defaults to BISIBILITY_CLOUD_URL or config
--project <id>, -p <id>  Project ID; flag > env > local link > global config
--config <path>, -c      Config file path
--json                   Print JSON where supported
--help, -h               Show command help
--version, -v            Show the CLI version
```

## Development

```sh
npm install
npm run check
```

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

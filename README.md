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

Command line interface for the Bisibility REST API.

## Install

Install the published package:

```sh
npm install -g @bisibility/cli
```

To work on the CLI from source:

```sh
git clone https://github.com/CorgiCorner/bisibility-cli.git
cd bisibility-cli
npm install
npm run check
npm link
```

## Auth and config

The CLI reads the API key from `BISIBILITY_API_KEY` first, then from the config file.
The API base URL defaults to `https://bisibility.com/api/v1`.

For full API independence, sign in through OAuth Authorization Code with PKCE:

```sh
bisibility auth login
bisibility auth status
bisibility auth logout
```

Login opens the browser and uses OAuth Authorization Code with PKCE and a
high-entropy state value. The callback listener binds only to `127.0.0.1` on the
first available port from 8976 through 8979. It accepts only `GET /callback`, and
checks any supplied `Origin` against the configured cloud and authorization
server. Defaults are an admin token named `CLI on <hostname>` expiring after 90
days; override them with `--scope read|write|admin`, `--name`, and
`--expires 30|90|365|never`. Logout revokes the calling PAT before clearing it.

On a headless machine, create a PAT at
[bisibility.com/app/account/security](https://bisibility.com/app/account/security), then run
`bisibility config set apiKey bsp_live_...`.

```sh
export BISIBILITY_API_KEY=bsk_live_...
export BISIBILITY_BASE_URL=https://bisibility.com/api/v1

bisibility auth status
```

To store local defaults:

```sh
bisibility config set apiKey bsk_live_...
bisibility config set baseUrl https://bisibility.com/api/v1
bisibility config set projectId prj_a12300000000000000000000
bisibility config get
```

Project selection follows a predictable precedence order:

1. `--project <id>` / `-p <id>`
2. `BISIBILITY_PROJECT_ID`
3. the nearest `.bisibility/project.json` directory link
4. the global `projectId` in the CLI config
5. automatic inference only when the credential can access exactly one project

The CLI never silently picks one project when multiple projects are available.
Select a global default or link a working directory instead:

```sh
bisibility projects list
bisibility projects use prj_a12300000000000000000000
bisibility projects current

cd ~/src/example.com
bisibility link prj_a12300000000000000000000
bisibility unlink
```

`bisibility projects use` also accepts an exact project name or domain. With no
argument it opens an interactive picker when multiple projects are available.
`bisibility link` writes a non-secret `.bisibility/project.json` file and adds
the directory to `.gitignore`.

## Public IDs

Every resource ID accepted by the CLI must use public ID v2: a lowercase resource
prefix, an underscore, and a 24-character lowercase alphanumeric suffix. For
example, `prj_a12300000000000000000000` and `kw_a12300000000000000000000` are
valid. The CLI rejects raw database IDs, legacy IDs, mixed-case values, and a
valid ID with the wrong resource prefix before it sends a request. Location
selection is deliberately different: use a `location_key` from `locations
search`; location resource IDs are not supported.

Default config path:

```text
~/.config/bisibility/config.json
```

Use `--config <path>` or `BISIBILITY_CONFIG` to use another file.

The CLI stores credentials as plaintext JSON in this file. On POSIX systems it
creates the default config directory with mode `0700` and creates or repairs the
config file to mode `0600`. Windows relies on the ACLs inherited from the user
profile. Protect backups and custom config locations accordingly, and prefer
environment variables in managed CI environments.

## Usage

Add keywords:

```sh
bisibility keywords add "rank tracker api" "seo rank monitor" \
  --project prj_a12300000000000000000000 \
  --device desktop \
  --country "United States" \
  --city "New York" \
  --target-url https://example.com/rank-tracker \
  --tag api \
  --tag launch
```

Use `--file <path>` for one keyword per line; blank lines and lines starting with `#` are ignored.
`--file -` reads stdin, and file keywords can be combined with positional keywords.

Location flags: `--country` and `--location` both set the market country name and
`--location` takes precedence (the API reads `location` as the country). Neither is a
city. For city-level targeting pass `--city` alongside the country, or pass
`--location-key` with a canonical location key, which overrides country and city.

List keywords:

```sh
bisibility keywords list --project prj_a12300000000000000000000 --limit 50
bisibility keywords list --project prj_a12300000000000000000000 --all --json
bisibility keywords list --project prj_a12300000000000000000000 --intent commercial --topic pricing
```

Check whether keyword text is already tracked, including every matching market:

```sh
bisibility keywords match "rank tracker" "untracked keyword" --project prj_123
```

The result shows normalized requested text separately from stored keyword text.
It reports `not tracked` texts and warns when more than 100 markets matched a text.

Research keyword opportunities from one seed or hydrate metrics for a keyword list:

```bash
bisibility keywords research "rank tracker" --project prj_a12300000000000000000000 --mode auto --limit 300
bisibility keywords research "rank tracker" --estimate --max-cost 6
bisibility keywords research "rank tracker" --clickstream --json
bisibility keywords metrics --keywords "rank tracker,seo monitor" --project prj_a12300000000000000000000
bisibility keywords metrics --keywords "rank tracker,seo monitor" --estimate --max-cost 4
bisibility keywords metrics --file keywords.txt --json
```

Research and uncached metrics are paid lookups on the project's DataForSEO
account and require API write scope. Research results and per-keyword metrics are cached for 12 hours.
Clickstream-refined volumes roughly double the provider cost. The CLI reports
the actual paid cost to stderr and keeps JSON output machine-readable on stdout.
Use `--estimate` for a free estimate envelope before spending. Use
`--max-cost <cents>` for a best-effort per-request guard. Estimates come from the
rates table, actual provider cost may differ slightly, and the monthly provider
budget remains the hard stop.

Inspect, update, or delete a keyword:

```sh
bisibility keywords get kw_a12300000000000000000000
bisibility keywords update kw_a12300000000000000000000 --target-url https://example.com/new --intent commercial
bisibility keywords update kw_a12300000000000000000000 --city Krakow --location Poland --frequency weekly
bisibility keywords update kw_a12300000000000000000000 --clear-target-url --clear-intent
bisibility keywords delete kw_a12300000000000000000000
```

Bulk update keywords:

```sh
bisibility keywords bulk add_tags --ids kw_a10000000000000000000000,kw_a20000000000000000000000 --tags api,launch
bisibility keywords bulk remove_tags --ids kw_a10000000000000000000000,kw_a20000000000000000000000 --tag api
bisibility keywords bulk set_frequency --ids kw_a10000000000000000000000,kw_a20000000000000000000000 --frequency daily
bisibility keywords bulk set_target_url --ids kw_a10000000000000000000000 --target-url https://example.com
bisibility keywords bulk delete --ids kw_a10000000000000000000000,kw_a20000000000000000000000
bisibility keywords bulk --input-json '{"operation":"delete","keyword_ids":["kw_a10000000000000000000000"]}'
```

Run a rank check:

```sh
bisibility check kw_a12300000000000000000000
bisibility check kw_a12300000000000000000000 --provider-id dataforseo --json
bisibility check run kw_a12300000000000000000000 --async
```

`--async` queues the check and returns immediately with status `running`; fetch the
result later with `check get`.

Inspect rank checks:

```sh
bisibility check get check_a12300000000000000000000
bisibility check list kw_a12300000000000000000000 --status failed --since 2026-01-01T00:00:00Z --all
```

Record and list signals (deploys, CMS publishes, custom API events):

```sh
bisibility signals create \
  --source deploy \
  --type deploy.completed \
  --severity info \
  --url https://example.com/release-notes \
  --payload '{"sha":"abc123"}' \
  --happened-at 2026-07-01T12:00:00Z
bisibility signals list --project prj_a12300000000000000000000 --source deploy --type deploy.completed
bisibility signals list --project prj_a12300000000000000000000 --from 2026-07-01T00:00:00Z --to 2026-07-02T00:00:00Z --all
```

`signals create --source` accepts only `api`, `cms`, or `deploy`; its severity is
`info`, `warning`, or `critical`, and `--payload` must be a JSON object no larger
than 8KB after serialization. `signals list --source` additionally accepts
`manual`, `rank_tracker`, `search_analytics`, `search_engine_status`, `sitemap`,
and `url_inspection` because those sources can be produced by other services.

Estimate rank check costs and inspect provider rate cards. These commands call
anonymous endpoints and work without an API key:

```sh
bisibility cost estimate --keywords 500 --devices 2 --frequency weekly --provider dataforseo
bisibility cost estimate --keywords 500 --option live --json
bisibility cost provider-rates
```

Search canonical location keys for keyword targeting:

```sh
bisibility locations search "new york"
bisibility locations search "warsaw" --country PL --limit 10 --json
```

Pass a matched `location_key` to `keywords add --location-key` or
`projects defaults --location-key`. `--country` accepts an ISO code or a
supported country name and `--limit` defaults to 20, maximum 100.

Read and synchronize traffic analytics:

```sh
bisibility analytics traffic-snapshots \
  --project prj_a12300000000000000000000 \
  --start-date 2026-07-01 \
  --end-date 2026-07-07 \
  --path /pricing
bisibility analytics query-stats \
  --project prj_a12300000000000000000000 \
  --start-date 2026-07-01 \
  --end-date 2026-07-07 \
  --query "rank tracker"
bisibility analytics sync --project prj_a12300000000000000000000 --idempotency-key sync-2026-07-07
```

`traffic-snapshots` and `query-stats` require `--start-date` and `--end-date` in
`YYYY-MM-DD` form. `sync` triggers a provider fetch and accepts an optional
`--idempotency-key` for retry-safe re-runs.

Manage projects and project defaults:

```sh
bisibility projects create --name "Example" --domain example.com
bisibility projects create --name "Example" --domain example.com --use
bisibility projects list
bisibility projects current
bisibility projects use example.com
bisibility projects get prj_a12300000000000000000000
bisibility projects update prj_a12300000000000000000000 --name "New name" --domain new-domain.com
bisibility projects delete prj_a12300000000000000000000
bisibility projects defaults prj_a12300000000000000000000 --country Poland --city Krakow --frequency daily
bisibility projects defaults prj_a12300000000000000000000 --clear-city --clear-cron-expression
```

Manage API keys:

```sh
bisibility api-keys list
bisibility api-keys create --name "CI key"
bisibility api-keys revoke key_a12300000000000000000000
```

Pass `--project` (or configure a project) to manage a project's API keys instead
of account-wide keys:

```sh
bisibility api-keys list --project prj_a12300000000000000000000
bisibility api-keys create --project prj_a12300000000000000000000 --name "Project CI key"
```

The create command prints the raw token once. Store it securely.

Manage your profile and personal access tokens:

```sh
bisibility me
bisibility me update --name "New Name"
bisibility me tokens list
bisibility me tokens create --name laptop --scope read --expires 90
bisibility me tokens revoke pat_a12300000000000000000000
```

The tokens create command prints the raw personal access token once. Pass
`current` as the ID to revoke the token you are authenticated with.

Discover the API without an API key:

```sh
bisibility capabilities
bisibility openapi --output openapi.json
bisibility llms-txt
```

Manage alert rules and triggered alerts:

```sh
bisibility alerts list --project prj_a12300000000000000000000
bisibility alerts triggered --project prj_a12300000000000000000000 --json
bisibility alerts mute alert_a12300000000000000000000 --project prj_a12300000000000000000000
bisibility alerts mark-read --project prj_a12300000000000000000000
bisibility alerts create \
  --project prj_a12300000000000000000000 \
  --name "Top 10 drop" \
  --condition threshold \
  --target-type keyword \
  --target-id kw_a12300000000000000000000 \
  --channel email \
  --threshold-position 10
bisibility alerts update rule_a12300000000000000000000 --input-json '{"name":"Top 3","condition_type":"enters_top_n"}'
bisibility alerts delete rule_a12300000000000000000000
```

Mute and mark-read change alert state for the whole project team.

Manage sitemap monitors:

```sh
bisibility sitemaps list --project prj_a12300000000000000000000
bisibility sitemaps enable --project prj_a12300000000000000000000
bisibility sitemaps disable prj_a12300000000000000000000 --project prj_a12300000000000000000000
```

Manage team members and invites:

```sh
bisibility team members --project prj_a12300000000000000000000
bisibility team invites --project prj_a12300000000000000000000
bisibility team invite teammate@example.com --project prj_a12300000000000000000000 --role viewer
bisibility team set-role member_a12300000000000000000000 --role admin --project prj_a12300000000000000000000
bisibility team remove member_a12300000000000000000000 --project prj_a12300000000000000000000
bisibility team revoke invite_a12300000000000000000000 --project prj_a12300000000000000000000
bisibility team resend-invite invite_a12300000000000000000000 --project prj_a12300000000000000000000
```

`team set-role` and `team remove` act on member IDs; `team resend-invite` and
`team revoke` act on invite IDs. Roles are `admin`, `member`, or `viewer`.

Manage data providers:

```sh
bisibility providers list --project prj_a12300000000000000000000
bisibility providers connect dataforseo \
  --project prj_a12300000000000000000000 \
  --login acct \
  --secret sec \
  --priority 10 \
  --enabled true
bisibility providers connect plausible \
  --project prj_a12300000000000000000000 \
  --provider-api-key plausible_key \
  --endpoint https://plausible.example.com
bisibility providers test dataforseo --project prj_a12300000000000000000000 --provider-api-key dfseo_...
bisibility providers enable dataforseo --project prj_a12300000000000000000000
bisibility providers disable dataforseo --project prj_a12300000000000000000000
bisibility providers priority dataforseo 20 --project prj_a12300000000000000000000
bisibility providers primary dataforseo --project prj_a12300000000000000000000
bisibility providers disconnect dataforseo --project prj_a12300000000000000000000
```

Manage saved views:

```sh
bisibility views list --project prj_a12300000000000000000000
bisibility views create \
  --project prj_a12300000000000000000000 \
  --name "API launch" \
  --config-json '{"filters":{"tags":["api"]},"search":"rank"}'
bisibility views delete view_a12300000000000000000000 --project prj_a12300000000000000000000
```

Manage competitors:

```sh
bisibility competitors list --project prj_a12300000000000000000000
bisibility competitors add competitor.com --project prj_a12300000000000000000000 --label "Competitor"
bisibility competitors remove comp_a12300000000000000000000 --project prj_a12300000000000000000000
```

Manage notification preferences:

```sh
bisibility notifications prefs --project prj_a12300000000000000000000
bisibility notifications prefs set \
  --project prj_a12300000000000000000000 \
  --alert-email false \
  --alert-slack true
```

Manage migration tokens:

```sh
bisibility tokens list --project prj_a12300000000000000000000
bisibility tokens mint --project prj_a12300000000000000000000 --scope keywords
bisibility tokens revoke mtok_a12300000000000000000000 --project prj_a12300000000000000000000
```

Export keywords and rank history:

```sh
bisibility export --project prj_a12300000000000000000000 --format json --output dump.json
bisibility export -p prj_a12300000000000000000000 -f csv -o dump.csv --history-limit 200
bisibility export --project prj_a12300000000000000000000 --no-history --output keywords.json
bisibility export rank-history --project prj_a12300000000000000000000
bisibility export rank-history --project prj_a12300000000000000000000 --range 90 --granularity weekly --out history.csv
bisibility export rank-history --project prj_a12300000000000000000000 --json --limit 200
```

`--history-limit` controls the rank-check page size per request and defaults to
`200`. Use `--no-history` to export keywords without rank history.
The rank-history command requests a server-generated CSV by default. Its rows include
`checked_at` timestamps. Pass `--json` for the paginated API envelope.

Push a JSON export package to Bisibility Cloud with a migration token:

```sh
bisibility cloud import dump.json --token mig_...
```

The import command posts the export package to `POST /cloud/import` on the
configured Cloud host, authenticating the migration token as an
`Authorization: Bearer` credential. Target a different instance for a
cross-instance migration with `--cloud-url`:

```sh
bisibility cloud import dump.json \
  --token mig_... \
  --cloud-url https://app.bisibility.cloud
```

Preview the request without sending it, and check whether the target instance
accepts your export before importing:

```sh
bisibility cloud import dump.json --token mig_... --dry-run
bisibility cloud compat --cloud-url https://app.bisibility.cloud
```

The import input must be a JSON export package object (the shape produced by
`bisibility export --format json`). The token defaults to
`BISIBILITY_MIGRATION_TOKEN`, and the cloud host defaults to
`BISIBILITY_CLOUD_URL` or config (normally `https://bisibility.com`). `cloud
compat` needs no migration token.

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

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

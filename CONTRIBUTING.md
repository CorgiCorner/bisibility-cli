# Contributing to Bisibility CLI

Thank you for helping improve the Bisibility command-line interface.

## Where to File What

- Bug reports for this repository: use the issue tracker here.
- Feature specs, ideas, and anything product-wide: use the
  [bisibility hub](https://github.com/CorgiCorner/bisibility). Specs go
  through its feature spec form and are triaged together with the app.

## Development setup

Use the Node.js and npm versions declared in `.nvmrc`, `packageManager`, and
`devEngines`. The CLI depends on the published `@bisibility/sdk` package.

```sh
nvm use
npm install
npm run check
```

`npm run check` verifies the development runtime, formatting and lint rules,
types, tests, coverage, and the production build. Run it before opening a pull
request.

## Pull requests

- Keep changes focused and include tests for behavior changes.
- Update the README and command help when flags or defaults change.
- Use English for code, documentation, commit messages, and pull requests.
- Do not include credentials, production data, or private infrastructure names.
- Add a changelog entry for user-visible changes.

By contributing, you agree that your contribution is licensed under the
Apache License, Version 2.0.

## Security reports

Do not open a public issue for a suspected vulnerability. Follow
[SECURITY.md](SECURITY.md) instead.

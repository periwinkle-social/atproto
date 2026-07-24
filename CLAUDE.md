# CLAUDE.md - AT Protocol Reference Implementation (Fork)

> **See also:** [../CLAUDE.md](../CLAUDE.md) for workspace-level context
> (Periwinkle architecture, environments)

This is Periwinkle's fork of Bluesky's AT Protocol TypeScript reference
implementation. It is a pnpm monorepo (runtime floor Node.js ≥22; local dev
and CI build/verify default to Node 24 via `.nvmrc` — only the test matrix
runs on 22) containing the canonical server-side implementation of the
protocol: PDS, AppView, Ozone moderation, OAuth provider, and all lexicon
schemas.

Workspace layout (see [pnpm-workspace.yaml](./pnpm-workspace.yaml) and
[tsconfig.json](./tsconfig.json)):

- [packages/\*](packages/) — top-level libraries: `api`, `common`, `crypto`,
  `identity`, `lexicon`, `repo`, `syntax`, `xrpc`, `xrpc-server`, `pds`,
  `bsky`, `bsync`, `ozone`, `dev-env`, `dev-infra`, etc.
- [packages/lex/\*](packages/lex/) — the modern type-safe Lexicon SDK family
  (`@atproto/lex`, `lex-builder`, `lex-cbor`, `lex-client`, `lex-data`,
  `lex-document`, `lex-json`, `lex-resolver`, `lex-server`, `lex-schema`,
  `lex-installer`, `lex-password-session`). New service code should use this
  in preference to the older `@atproto/api` / `@atproto/lexicon` /
  `@atproto/xrpc` / `@atproto/lex-cli` stack — see the `lex-sdk` skill.
- [packages/oauth/\*](packages/oauth/) — OAuth client/provider
  implementations and JWK helpers.
- [packages/internal/\*](packages/internal/) — `@atproto-labs/*` internal
  shared utilities (fetch, handle/identity/DID resolvers, simple-store,
  pipe, xrpc-utils, rollup plugin).
- [services/{pds,bsky,bsync,ozone}](services/) — thin runtime wrappers
  (dd-trace, otel); the actual implementation code lives in
  `packages/{pds,bsky,bsync,ozone}`.
- [lexicons/](lexicons/) — canonical JSON Lexicon schemas for
  `com.atproto.*`, `app.bsky.*`, `chat.bsky.*`, `tools.ozone.*`. These are
  the source-of-truth that codegen consumes.
- [interop-test-files/](interop-test-files/) — language-neutral protocol
  conformance fixtures. Don't edit unless changing protocol-level behavior;
  these are shared across SDKs.

## Package Manager

**This repo uses pnpm** (v11.11.0, see `devEngines.packageManager` in
`package.json`). All other Periwinkle repos use npm — do NOT use npm here.

## GitHub CLI — fork gotcha

This repo is a fork of `bluesky-social/atproto`. `gh pr create` defaults to the
**parent** repo, so without `--repo` it will open PRs against upstream Bluesky.
Always pass `--repo periwinkle-social/atproto` when creating PRs here:

```bash
gh pr create --repo periwinkle-social/atproto --base main ...
```

Same applies to `gh pr list`, `gh pr view`, etc. when you mean our fork.

## Common commands

Whole-repo verification commands (from root):

```bash
pnpm install --frozen-lockfile   # install deps
pnpm verify         # parallel: style + lint
pnpm build --force  # single root `tsgo --build` over the project-references graph, then UI bundlers
pnpm codegen        # parallel codegen across all packages; runs from .ts sources via Node type-stripping
pnpm test           # run all tests (requires Docker: Postgres 14 + Redis 7)
pnpm format         # eslint fix + prettier write
pnpm prettier --write <file>     # format a specific file before committing
pnpm run style      # check all files pass Prettier (CI runs this)
```

The pipeline is: `build:tooling` → `codegen` → `prebuild` → `build` (one
`tsgo --build tsconfig.json` at the root) → `postbuild` (Vite/UI bundlers).

The [Makefile](Makefile) wraps the most common entry points: `make build`,
`make test`, `make lint`, `make fmt`, `make codegen`, `make run-dev-env`
(boots the in-process PDS+AppView+bsync+plc+ozone constellation),
`make run-dev-env-logged` (same with `pino-pretty` log output),
`make fmt-lexicons` (eslint-fix on `lexicons/*.json`).

Per-package work — **always run from inside the package directory**, not
from the root:

```bash
cd packages/<pkg>
pnpm exec tsgo --build tsconfig.build.json   # build that package + its referenced deps
pnpm test                                    # run that package's test suite
pnpm exec prettier --write <path>            # format specific files only
pnpm exec eslint --fix <path>                # lint specific files only
```

Every package now ships a `tsconfig.build.json` (composite, with explicit
`references` to its workspace deps) and a `tsconfig.test.json` for the test
sources. The root `tsconfig.json` is a project-graph aggregator only.

Avoid `pnpm run style:fix` (whole-repo prettier) unless the user explicitly
asks for a repo-wide formatting pass.

## Tests

Before writing or extending any test, invoke the `testing` skill
([.claude/skills/testing/SKILL.md](.claude/skills/testing/SKILL.md)). It
covers runner selection (vitest vs jest), file layout, and tsconfig setup.
For browser-driven UI tests, or for demoing/debugging the OAuth flows or the
Account Manager interface, invoke the `playwright` skill
([.claude/skills/playwright/SKILL.md](.claude/skills/playwright/SKILL.md))
instead.

- Tests require Docker (Postgres 14 + Redis 7), spun up by
  `packages/dev-infra/with-test-redis-and-db.sh`
- Integration tests use `@atproto/dev-env` (`TestNetwork.create()`) for full
  in-process services
- `SeedClient` provides helpers to create users, posts, follows, likes
- 8-shard CI matrix with `--maxWorkers=1`
- Test timeout: 60s

## Codegen

After editing anything under [lexicons/](lexicons/), run `pnpm codegen` from
the repo root before building or testing. The `bsky` package additionally
runs `buf generate` for protobuf bindings against `bsync` as part of its
codegen step.

For everything else lexicon-related — `lex install` / `lex build`, the
per-package `prebuild` setup, and migrating from the legacy `@atproto/api` /
`@atproto/lexicon` / `@atproto/xrpc` / `@atproto/lex-cli` stack to the new
`@atproto/lex` family — invoke the `lex-sdk` skill
([.claude/skills/lex-sdk/SKILL.md](.claude/skills/lex-sdk/SKILL.md)).

## Code Style

- **Prettier**: no semicolons, single quotes, 2-space indent, trailing commas.
  All committed files (including non-code like CLAUDE.md, JSON) must pass
  `prettier --check .` — CI will fail otherwise. Run
  `pnpm prettier --write <file>` before committing
- **ESLint**: import ordering enforced (`builtin` → `external` → `@atproto` →
  `parent` → `sibling`), `no-var` error, `prefer-const` warn, `eqeqeq` enforced,
  Node protocol imports required (`node:fs`)
- `@typescript-eslint/no-explicit-any` is OFF
- Unused variables: error with `argsIgnorePattern: "^_"`

## Key Conventions

- **Files**: `kebab-case.ts`; classes: `PascalCase`; functions/variables:
  `camelCase`
- **Generated code is committed**: `src/lexicon/` directories contain TypeScript
  generated from `lexicons/` — regenerate with `pnpm codegen` when lexicons
  change
- **Release-please for versioning**: Periwinkle fork uses release-please (not
  upstream's changesets). Conventional commits on `main` drive the changelog
- **Database migrations**: Kysely `Migrator` with timestamped files
  (`20230309T045948368Z-init.ts`), create via `pnpm migration:create`
- **Logging**: `pino` with `subsystemLogger(name)` from `@atproto/common`
- Node ≥22 runtime floor; build/dev default to Node 24 (`.nvmrc`). ESM only
  (`"type": "module"` in every package). Use `node --enable-source-maps` for
  production-style runs.
- TypeScript compilation uses `tsgo` (TS7, `@typescript/native-preview`), not
  `tsc`. There is no per-package `typescript` devDependency — `tsgo` is
  hoisted at the root.
- Import paths use workspace protocol (`workspace:^`). Don't pin internal
  packages to a published version.
- Don't refactor unrelated code; this project's contribution guidelines
  explicitly discourage large refactors and unsolicited tooling changes (see
  [README.md](README.md) "Contributions").
- Don't add new dependencies without strong justification.
- When picking lexicon SDK APIs in new code, prefer the `@atproto/lex` family
  over the old `@atproto/api` stack.

## Architectural Patterns

### AppContext Dependency Injection

Every service creates an `AppContext` holding all stateful dependencies (db,
config, auth verifier, etc.). Routes receive `ctx` — no global singletons.

### Skeleton/Hydration/Rules/Presentation Pipeline (AppView)

API endpoints in `@atproto/bsky` follow a strict four-step pipeline:

1. **Skeleton** — resolve relevant DIDs/URIs
2. **Hydration** — batch-fetch data from dataplane
3. **Rules** — apply moderation/visibility filtering
4. **Presentation** — format into API response

### Per-Actor SQLite Stores (PDS)

Each user/DID gets its own SQLite file at
`<actorStoreDirectory>/<2-char-hash>/<did>/store.sqlite`. Separate
`account.sqlite` and `sequencer.sqlite` databases for account-level and
sequencer state.

### Lexicon-Driven Code Generation

`lex gen-server` generates typed request handlers from lexicon JSON.
`lex gen-api` generates typed client methods. Both output to `src/lexicon/` or
`src/client/`.

## Environment Variables (PDS)

All prefixed `PDS_`:

- `PDS_HOSTNAME`, `PDS_PORT`, `PDS_SERVICE_DID`
- `PDS_DATA_DIRECTORY` — root for SQLite files
- `PDS_BLOBSTORE_S3_BUCKET` or `PDS_BLOBSTORE_DISK_LOCATION`
- `PDS_JWT_SECRET`, `PDS_ADMIN_PASSWORD`, `PDS_DPOP_SECRET`
- `PDS_DID_PLC_URL`, `PDS_BSKY_APP_VIEW_URL`

See `packages/pds/src/config/env.ts` for the full list.

## Troubleshooting

- **Stale codegen.** If the build fails due to a generated file in
  [packages/api](packages/api) or [packages/ozone](packages/ozone) being out
  of date, run `pnpm run codegen && pnpm run build` from those packages,
  then re-run the build. This is only needed on these two packages because
  their `prebuild` step skips codegen as a performance optimization.
- **Codegen ran but produced stale output.** Codegen relies on
  `pnpm build:tooling` to build the `@atproto/lex-cli` and
  `@atproto/lex-builder` packages first. If you see a codegen failure, run
  `pnpm build:tooling` from the root, then re-run codegen.
- **End-to-end test fails with stale infra.** If docker containers persist
  across test runs, reset them with `cd packages/dev-infra && docker compose
down --volumes`.

## Architecture notes

- **Lexicons are the contract.** The JSON files in [lexicons/](lexicons/)
  drive both client types and server route validation. Service packages
  don't hand-write XRPC method signatures — they import the generated
  definitions from their `src/lexicons/` directory (gitignored / regenerated).
- **PDS** ([packages/pds](packages/pds)) — a single-tenant atproto server:
  account management, repo storage (kysely-over-sqlite), actor storage
  (kysely-over-postgres), email, OAuth provider, blob storage. Runtime entry
  point is [services/pds](services/pds); production code is in
  `packages/pds/src`.
- **Bsky AppView** ([packages/bsky](packages/bsky)) — read-side service for
  `app.bsky.*` queries (timelines, profiles, feed generators, hydration
  pipeline, GraphQL-like view composition). Talks to PDSes via XRPC and to
  `bsync` via Connect-RPC (protobuf in `packages/bsky/proto`). Runtime entry
  point in [services/bsky](services/bsky).
- **Bsync** ([packages/bsync](packages/bsync)) — internal service for
  cross-AppView synchronization (mutes, notifications). Connect-RPC
  interface.
- **Ozone** ([packages/ozone](packages/ozone)) — moderation service for
  `tools.ozone.*`.
- **dev-env** ([packages/dev-env](packages/dev-env)) — boots a full PDS +
  AppView + bsync + plc + ozone constellation in-process for tests and the
  `make run-dev-env` REPL. Most integration tests in `pds`/`bsky`/`ozone`
  use it as a fixture builder.
- **OAuth** ([packages/oauth](packages/oauth)) — split into `oauth-types`
  (shared schemas), `oauth-client` (browser/node/expo variants),
  `oauth-provider` (used inside the PDS), and `oauth-scopes`.

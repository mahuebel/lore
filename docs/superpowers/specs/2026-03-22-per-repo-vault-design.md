# Per-Repo Vault Support

**Date:** 2026-03-22
**Status:** Approved

## Problem

vault-sync currently assumes a single global vault at `~/.lore/vault/`. All observations, suggestions, and vault notes flow through one shared knowledge base. This works well for teams working on related products under one business, but breaks down for:

- Solo developers with unrelated projects
- Freelancers working across client codebases
- Anyone who wants knowledge isolation between projects

## Goals

- Enable per-repo vault configuration while keeping global vault as the easy default
- Zero breaking changes for existing users
- Tool-agnostic — works with Claude Code, Cursor, and future integrations
- Single daemon process — no per-vault daemon instances

## Non-Goals

- Full observation pipeline isolation (per-vault queues, per-vault evaluation)
- Per-vault daemon instances
- Automatic vault discovery without explicit configuration

## Design

### Configuration: `.lore/config.json`

A tool-agnostic config file placed at a project's root. Optional — if absent, the global vault is used.

```json
{
  "vault_path": "~/.lore/vaults/my-project",
  "vault_remote": "git@github.com:user/my-project-vault.git",
  "author": "mahuebel"
}
```

- `vault_path` (required): absolute path or `~`-prefixed path to the vault directory
- `vault_remote` (optional): git remote URL — if present, setup clones from it; if absent, setup runs `git init` locally
- `author` (optional): git author identifier for vault commits

Every vault is a git repo, consistent with the existing global vault architecture.

### Default vault path convention

Per-repo vaults default to `~/.lore/vaults/<repo-name>/`. Users can override with a custom path during setup.

The global vault remains at `~/.lore/vault/` (singular, no "s").

### Vault Resolution

A unified `resolveVaultForProject(cwd: string)` function replaces the current `resolveVaultPath()`. Used by both the MCP server and the daemon/hooks layer.

Resolution order:
1. Walk up from `cwd` looking for `.lore/config.json` — if found, read `vault_path`
2. `VAULT_PATH` environment variable
3. `~/.lore/vault/` (global default)

**Path normalization:** All vault paths are resolved to absolute, `realpath`-resolved paths before being used as keys in `pending-suggestions.json` or compared across callers. The `expandTilde` helper expands `~` to `os.homedir()`, and `path.resolve()` normalizes relative segments. This prevents key mismatches like `/Users/x/.lore/vaults/foo` vs `~/.lore/vaults/foo`.

**Nested project resolution:** The walk-up strategy finds the nearest `.lore/config.json` to `cwd`. This means the innermost config wins — a submodule with its own `.lore/config.json` uses its own vault, even if the parent monorepo also has one.

**Legacy candidate removal:** The current `resolveVaultPath()` checks legacy candidate paths (`~/vault`, `~/obsidian/team-vault`) and reads `.vault-mcp.json` files. These are removed in the new `resolveVaultForProject()`. The resolution chain is simplified to: project config → env var → global default.

```typescript
function resolveVaultForProject(cwd: string): string | null {
  // 1. Walk up from cwd looking for .lore/config.json
  let dir = cwd;
  while (dir !== path.dirname(dir)) {
    const configPath = path.join(dir, '.lore', 'config.json');
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.vault_path) {
        return expandTilde(config.vault_path);
      }
    } catch { /* not found, keep walking */ }
    dir = path.dirname(dir);
  }

  // 2. VAULT_PATH env var
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;

  // 3. Global default
  const fallback = path.join(os.homedir(), '.lore', 'vault');
  try {
    statSync(fallback);
    return fallback;
  } catch {
    return null;
  }
}
```

### Daemon Changes

The daemon remains a single global process on port 37778.

**Observation tagging:** Already in place — `post-tool-use.ts` captures `cwd` on every observation. No changes needed.

**Vault-aware suggestion storage:** `pending-suggestions.json` changes from a flat array to a vault-keyed object:

```json
{
  "/Users/you/.lore/vaults/my-project": [
    { "title": "...", "confidence": 0.85, "tags": ["..."], "evaluatedAt": 1234 }
  ],
  "/Users/you/.lore/vault": [
    { "title": "...", "confidence": 0.72, "tags": ["..."], "evaluatedAt": 1235 }
  ]
}
```

Keys are always absolute, resolved paths (never `~`-prefixed) to prevent mismatches across callers.

When `evaluateInBackground` runs, it groups observations by resolved vault path (using each observation's `cwd`). Observations with missing `cwd` are assigned to the global vault. Each vault group is evaluated as a separate batch, and resulting suggestions are stored under the corresponding vault key. If all observations in a batch share the same `cwd` (the common case — one session, one project), no grouping overhead occurs.

**Promotion routing:** When a suggestion is promoted (via dashboard or `/vault-note`), the daemon writes the markdown file to the vault path associated with that suggestion.

**Daemon API changes:** Endpoints that operate on suggestions gain vault awareness:

- `GET /suggestions` — accepts optional `?vault=<path>` query param. If provided, returns suggestions for that vault only. If omitted, returns all suggestions grouped by vault.
- `POST /suggestions/promote/:index` — accepts `vault` in the request body to identify which vault's suggestion array to index into. Writes the promoted note to that vault.
- `POST /suggestions/dismiss` — accepts optional `vault` in the body. If provided, dismisses only that vault's suggestions. If omitted, dismisses all (preserving current behavior).
- `DELETE /suggestions/:index` — accepts `vault` in the request body to identify which vault's suggestion array to index into.
- `GET /vault/notes` — accepts optional `?vault=<path>` to scope note listing to a specific vault. If omitted, reads from the daemon's default resolved vault (current behavior).
- `GET /vault/notes/:path` — accepts optional `?vault=<path>` to read a note from a specific vault.
- `GET /vault/git-status` — accepts optional `?vault=<path>` to check sync status of a specific vault.

**Session-start hook filtering:** The hook resolves the current project's vault path (using its own `cwd`) and passes `?vault=<resolved-path>` when fetching suggestions. Only suggestions for the current project are shown. Suggestions from other projects remain in storage but are not surfaced.

**Dashboard:** Suggestions and vault notes get a project/vault label. The dashboard can show all vaults or filter by one. The vault selector populates from the keys in `pending-suggestions.json`.

### MCP Server Changes

**Dynamic resolution:** The MCP server gains `resolveVaultForProject(cwd)`. When registered at user scope without a `VAULT_PATH` override, it dynamically resolves the vault per-project by reading `.lore/config.json` from the working directory.

This means users don't need a separate MCP server registration per project. One global registration works; `.lore/config.json` in each repo controls which vault it uses.

**Behavior matrix:**

| MCP Registration | `.lore/config.json` | Result |
|-----------------|---------------------|--------|
| User scope, no `VAULT_PATH` | Present | Per-repo vault |
| User scope, no `VAULT_PATH` | Absent | Global vault |
| User scope, `VAULT_PATH` set | Any | Explicit override |
| Project scope, `VAULT_PATH` set | Any | Explicit override |

**cwd availability:** The MCP server runs as a stdio child process. Its `process.cwd()` depends on how the client spawns it and may not reflect the current project — especially for user-scoped registrations where the server stays alive across projects.

To handle this reliably, the MCP server resolves the vault path **per tool call**, not at startup. Each MCP tool call receives context about the client's working directory via the MCP `roots` capability (if supported) or via a `cwd` parameter in the tool input. As a fallback, the server checks `process.cwd()`. The resolution strategy:

1. Tool-call `cwd` parameter (if provided by the client)
2. MCP `roots` (if the client advertises workspace roots)
3. `process.cwd()` (works when server is launched per-project)
4. `VAULT_PATH` env var
5. Global default `~/.lore/vault/`

This per-call resolution ensures correct vault targeting even when a single MCP server instance serves multiple projects.

### Setup UX

The `/vault-setup` skill gains a project mode.

**Global setup (existing, unchanged):**
```
/vault-setup
→ Clones/inits vault at ~/.lore/vault/
→ Registers MCP at user scope
→ Done
```

**Per-project setup (new):**
```
/vault-setup --project
→ Asks: remote URL or local-only?
→ Asks: vault path? (default: ~/.lore/vaults/<repo-name>/)
→ Clones/inits vault at chosen path
→ Creates .lore/config.json in project root
→ Asks: configure MCP for Claude Code, Cursor, or both?
→ Writes .mcp.json and/or .cursor/mcp.json if user wants explicit project-scoped MCP
→ Done
```

The project-scoped MCP step is optional — dynamic resolution via `.lore/config.json` handles it when a user-scoped MCP registration already exists.

**`.lore/` gitignore guidance:** Setup asks whether to gitignore `.lore/`. For solo projects, gitignore (local config only). For team repos, commit it so everyone shares the vault pointer. The `config.json` contains no secrets.

**Status visibility:** A vault status indicator (in `/vault-status` or the dashboard) shows which vault the current project resolves to and the resolution path used.

### Migration & Backwards Compatibility

**Zero breaking changes.** This is purely additive.

- No `.lore/config.json` → everything works exactly as today
- `VAULT_PATH` env var → still honored at position 2 in the resolution chain
- Existing MCP registrations → unchanged

**`pending-suggestions.json` migration:** On first run, the daemon detects the old array format and migrates to the keyed structure:

```typescript
if (Array.isArray(raw)) {
  // Use the known global default, not process.cwd() — the daemon's
  // cwd is wherever it was spawned, not necessarily a project directory.
  const globalVault = path.join(os.homedir(), '.lore', 'vault');
  migrated = { [globalVault]: raw };
}
```

**Version:** 3.3.0 (minor bump — new functionality, no breaking changes)

## Documentation

The root `README.md` must be updated to document per-repo vault support:

- Add a "Per-Repo Vaults" section explaining the feature and when to use it
- Document `.lore/config.json` format and fields
- Show the resolution chain (project config → env var → global default)
- Provide setup examples for both Claude Code and Cursor
- Include a quick-start for per-project setup (`/vault-setup --project`)
- Update the existing global setup instructions to clarify they create the default vault

The `vault-mcp/README.md` should also be updated to document the dynamic vault resolution behavior when `VAULT_PATH` is not explicitly set.

## Components Affected

| Component | Change |
|-----------|--------|
| `vault-reader.ts` | Replace `resolveVaultPath()` with `resolveVaultForProject(cwd)` |
| `daemon.ts` | Vault-keyed suggestion storage, promotion routing, dashboard grouping |
| `types.ts` | Update suggestion storage type |
| `hooks/session-start.ts` | Filter suggestions by current project's vault |
| `hooks/post-tool-use.ts` | No changes (already captures `cwd`) |
| `hooks/stop.ts` | No changes |
| `hooks/user-prompt-submit.ts` | Update vault path resolution if it reads vault context |
| `vault-context.ts` | No changes (already receives `vaultPath` as parameter) |
| `vault-mcp` | Add `resolveVaultForProject` to MCP server |
| `skills/setup/SKILL.md` | Add `--project` flow |
| `plugin.json` | Version bump to 3.3.0 |
| `dashboard.html` | Vault grouping/filtering UI |
| `README.md` | Document per-repo vault feature, `.lore/config.json`, setup examples |
| `vault-mcp/README.md` | Document dynamic vault resolution |

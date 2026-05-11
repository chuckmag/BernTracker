# apps/mcp — CLAUDE.md

MCP server-specific guidance. See the repo-root `CLAUDE.md` for cross-cutting topics (worktree dev, PR rules, schema migrations).

> **Convention:** any new pattern or rule that applies only to the MCP server belongs here, not in the root.

## Architecture

- **Transports:** Streamable HTTP (`POST /mcp`) primary; legacy SSE (`GET /sse` + `POST /messages`) for older clients; stdio (`--stdio` flag) for local Claude Desktop testing.
- **Auth:** `src/auth/keycloak.ts` exports `requireAuth` — validates RS256 Bearer JWTs via JWKS at `KEYCLOAK_ISSUER_URL`. Stdio mode bypasses auth entirely (trusted process pipe).
- **Tools:** registered in `src/server.ts` via `registerXxxTools()` functions in `src/tools/`. One file per domain group.
- **DB access:** import managers directly from `apps/api/src/db/` for now. Extraction to a shared package is tracked in #315.
- **OIDC discovery:** `GET /.well-known/oauth-authorization-server` proxies the Keycloak discovery document so AI clients can auto-discover the auth server (RFC 8414).

## Adding a new tool

1. Open the relevant `src/tools/*.ts` file (workouts, programs, or results).
2. Replace the stub with a real implementation — call the db manager, enforce `MEMBER` role if needed, return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`.
3. Build and smoke-test locally (see *Local testing* below).
4. Run the integration test suite: `npm run test --workspace=@wodalytics/mcp`.

## Local testing with Claude Desktop (stdio)

This is the fastest feedback loop — no Keycloak, no deployed service, no token.

**One-time setup:**

1. Build the app:
   ```bash
   npm run build --workspace=@wodalytics/mcp
   ```

2. Add the server to `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "wodalytics": {
         "command": "/opt/homebrew/bin/node",
         "args": [
           "/path/to/repo/apps/mcp/dist/index.js",
           "--stdio"
         ],
         "env": {
           "DATABASE_URL": "postgresql://postgres:postgres@localhost:5432/berntracker"
         }
       }
     }
   }
   ```
   Replace `/path/to/repo` with the absolute path to your checkout (or worktree). If working in a worktree the path will be `.claude/worktrees/<branch>/apps/mcp/dist/index.js`.

   > **Use the full path to `node`** — Claude Desktop is a macOS GUI app and launches processes with a restricted `PATH` that excludes Homebrew (`/opt/homebrew/bin`). Using `"command": "node"` results in a *"Could not load connectors directory"* error. Verify your node path with `which node` if it differs from `/opt/homebrew/bin/node`.

3. Restart Claude Desktop — MCP servers only initialize on launch.

**After each code change:** rebuild (`npm run build --workspace=@wodalytics/mcp`) and restart Claude Desktop.

**Verify the connection:** ask Claude Desktop *"What tools does the wodalytics MCP server have?"* — all registered tools should be listed. Stubs return a "not implemented" error when called; real implementations return data.

**Smoke-test without Claude Desktop** (pipe a JSON-RPC initialize directly):
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' \
  | node apps/mcp/dist/index.js --stdio
```
Should print a JSON-RPC result with `serverInfo.name: "wodalytics"`.

## Remote testing with Claude.ai (OAuth flow)

Requires the MCP service deployed on Railway and a Keycloak client configured with Claude.ai's redirect URI. See #343 for the full checklist. High-level steps:

1. Ensure `KEYCLOAK_ISSUER_URL` is set on the Railway MCP service.
2. Add `https://claude.ai/api/mcp/auth_callback` to the `wodalytics-mcp` client's `redirectUris` in `infra/keycloak/realm-wodalytics.json` (verify the exact URI from the live OAuth request first).
3. Confirm `GET https://mcp.qa.wodalytics.com/.well-known/oauth-authorization-server` returns a valid OIDC discovery document.
4. In Claude.ai → Settings → Integrations → Add MCP Server, enter `https://mcp.qa.wodalytics.com/mcp`.
5. Complete the Keycloak login flow — Claude.ai will redirect to Keycloak, exchange the code, and store the token.
6. Ask Claude.ai *"What tools does WODalytics give you?"* to confirm the connection.

## Integration tests

```bash
# From repo root
npm run test --workspace=@wodalytics/mcp

# From apps/mcp/
npx dotenv-cli -e ../../.env -- npx tsx tests/scaffold.ts
```

Tests spin up an in-process JWKS mock and MCP Express app — no external Keycloak or running server needed. See `tests/scaffold.ts` for the full list of covered cases.

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `KEYCLOAK_ISSUER_URL` | Yes (HTTP mode) | e.g. `https://auth.qa.wodalytics.com/realms/wodalytics` |
| `DATABASE_URL` | Yes (when tools query DB) | Postgres connection string |
| `PORT` | No | HTTP listen port, defaults to `3002` |

`KEYCLOAK_ISSUER_URL` is not read in stdio mode — the `--stdio` flag skips all HTTP and auth setup entirely.

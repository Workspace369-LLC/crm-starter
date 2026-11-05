# CRM starter: instructions for coding agents

This app is a thin CRM front end. **Workspace369 is the system of record** for clients, proposals, invoices and payments. Do not create local tables, JSON files or mock stores for these records.

## Rules
- All data goes through `lib/workspace369.ts` (`callTool` / `readTool`), which POSTs JSON-RPC `tools/call` to `https://mcp.workspace369.com/mcp/crm` (the core CRM tools; `/mcp` is the full set). Add new features as new helpers in `lib/crm.ts`.
- The token (`W369_TOKEN`) is server-only. Never prefix it with `NEXT_PUBLIC_`, never import `lib/*` from a `"use client"` file, never log it, never commit `.env`. Do not create tokens for the user; they create one in Settings → AI → AI connections.
- Keep the password gate (`middleware.ts`, `lib/gate.ts`). The app holds a token that can change records, so every route, server actions included, must stay behind `APP_PASSWORD` in production. Don't add routes the matcher skips.
- Drafts only. Use `proposals_create_draft` / `invoices_create_draft`. Never call `proposals_send`, `invoices_send` or `payments_record` from this app: sending stays in the Workspace369 app's approval flow. If a call returns `held_for_approval`, show the `approval_url` and stop; do not retry the call.
- Handle `isError` results (they throw `W369Error` kind `tool`) and 401/429 explicitly. Reuse an `idempotency_key` when retrying writes.

- **Pipeline setup needs the user's yes.** `npm run setup` (`scripts/setup.mjs`, blueprint in `config/crm-blueprint.json`) calls `crm_apply_blueprint`. An agent must run the dry run, show the user the preview, and get their explicit yes before applying (`dry_run: false`). Never apply on your own, never skip the dry run, and never add a `--yes` flag. The tool is all-or-nothing, keeps existing stages and fields, and deletes nothing. If it is refused, show the reason; don't retry with a different token or scope.

## Commands
`npm test` (unit tests, mocked fetch) · `npm run typecheck` · `npm run build` · `npm run setup` (starter pipeline, asks y/N)
- Tool argument and field names in `lib/crm.ts` come from the server schemas (see the header comment there). Note `clientId` (camelCase) on search tools but `client_id` on create tools, and paging is `limit` (max 100) + `cursor`/`nextCursor`.

# CRM starter: instructions for coding agents

This app is a thin CRM front end. **Workspace369 is the system of record** for clients, proposals, invoices and payments. Do not create local tables, JSON files or mock stores for these records.

## Rules
- All data goes through `lib/workspace369.ts` (`callTool` / `readTool`), which POSTs JSON-RPC `tools/call` to `https://mcp.workspace369.com/mcp`. Add new features as new helpers in `lib/crm.ts`.
- The token (`W369_TOKEN`) is server-only. Never prefix it with `NEXT_PUBLIC_`, never import `lib/*` from a `"use client"` file, never log it, never commit `.env`. Do not create tokens for the user; they create one in Settings → AI connections.
- Keep the password gate (`middleware.ts`, `lib/gate.ts`). The app holds a token that can change records, so every route, server actions included, must stay behind `APP_PASSWORD` in production. Don't add routes the matcher skips.
- Drafts only. Use `proposals_create_draft` / `invoices_create_draft`. Never call `proposals_send`, `invoices_send` or `payments_record` from this app: sending stays in the Workspace369 app's approval flow. If a call returns `held_for_approval`, show the `approval_url` and stop; do not retry the call.
- Handle `isError` results (they throw `W369Error` kind `tool`) and 401/429 explicitly. Reuse an `idempotency_key` when retrying writes.

## Commands
`npm test` (unit tests, mocked fetch) · `npm run typecheck` · `npm run build`
- Tool argument and field names in `lib/crm.ts` come from the server schemas (see the header comment there). Note `clientId` (camelCase) on search tools but `client_id` on create tools, and paging is `limit` (max 100) + `cursor`/`nextCursor`.

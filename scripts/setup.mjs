#!/usr/bin/env node
// `npm run setup`: set up a starter pipeline (stages + client custom fields) in your Workspace369 workspace.
//
// 1. Reads WORKSPACE369_TOKEN / WORKSPACE369_MCP_URL (or this repo's W369_TOKEN / W369_MCP_URL) from the
//    environment or .env.local. The token is used for the Authorization header only and is never printed.
// 2. Lists the tools (tools/list) and checks crm_apply_blueprint takes the arguments this script sends.
// 3. Shows your current stages and fields (workspace_schema).
// 4. Reads config/crm-blueprint.json, asks crm_apply_blueprint for a dry run and prints the preview.
// 5. Asks y/N. Only "y" calls crm_apply_blueprint again with dry_run false.
//
// The tool is all-or-nothing, keeps existing stages and fields and deletes nothing.
// It needs the clients:write scope plus manage-stages and edit-business-details permission (the owner has both).
// Sample data: `npm run mock`, then W369_TOKEN=mock-token W369_MCP_URL=http://localhost:4010/mcp npm run setup
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

export const DEFAULT_URL = "https://mcp.workspace369.com/mcp/crm";
export const MAX_STAGES = 12;
export const MAX_FIELDS = 30;
export const TOOL = "crm_apply_blueprint";

/** Token and URL from the environment. W369_* (this repo's names) win over WORKSPACE369_*. */
export function readConfig(env = process.env) {
  return {
    token: env.W369_TOKEN || env.WORKSPACE369_TOKEN || "",
    url: env.W369_MCP_URL || env.WORKSPACE369_MCP_URL || DEFAULT_URL,
  };
}

function parseBody(text, contentType) {
  if (contentType.includes("text/event-stream")) {
    let last;
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n");
      if (!data) continue;
      const msg = JSON.parse(data);
      if (msg.result || msg.error) last = msg;
    }
    if (!last) throw new Error("The server reply had no JSON-RPC message.");
    return last;
  }
  return JSON.parse(text);
}

/** A tiny JSON-RPC client. `rpc(method, params)` resolves to `result` and throws on transport/RPC errors. */
export function createClient({ token, url, fetchImpl = fetch }) {
  const redact = (s) => (token ? String(s).split(token).join("***") : String(s));
  async function rpc(method, params) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(redact(`Workspace369 HTTP ${res.status}: ${text.slice(0, 300)}`));
    const env = parseBody(text, res.headers.get("content-type") ?? "");
    if (env.error) throw new Error(redact(`Workspace369 RPC error ${env.error.code}: ${env.error.message}`));
    return env.result;
  }
  return {
    listTools: async () => (await rpc("tools/list"))?.tools ?? [],
    /** Resolves to { isError, text, data }. A refused tool call is a value, not a throw, so callers can show the reason. */
    async call(name, args) {
      const r = (await rpc("tools/call", { name, arguments: args })) ?? {};
      const text = (r.content ?? []).find((c) => c.type === "text")?.text ?? "";
      return { isError: !!r.isError, text: redact(text), data: r.structuredContent };
    },
  };
}

/** Local checks that save a round trip. The server validates again. */
export function validateBlueprint(bp) {
  const errors = [];
  if (!bp || typeof bp !== "object") return ["The blueprint file must be a JSON object."];
  const { stages = [], custom_fields: fields = [] } = bp;
  if (!Array.isArray(stages) || !Array.isArray(fields)) return ["`stages` and `custom_fields` must be arrays."];
  if (stages.length === 0 && fields.length === 0) errors.push("The blueprint has no stages and no custom_fields.");
  if (stages.length > MAX_STAGES) errors.push(`At most ${MAX_STAGES} stages (you have ${stages.length}).`);
  if (fields.length > MAX_FIELDS) errors.push(`At most ${MAX_FIELDS} custom fields (you have ${fields.length}).`);
  stages.forEach((s, i) => { if (!s?.name) errors.push(`stages[${i}] needs a name.`); });
  fields.forEach((f, i) => {
    if (!f?.label || !f?.type) errors.push(`custom_fields[${i}] needs a label and a type.`);
    else if (f.type === "select" && !(f.options?.length > 0)) errors.push(`custom_fields[${i}] (${f.label}) is a select and needs options.`);
  });
  return errors;
}

/** The arguments sent to the tool: only the keys the server knows, never the "_comment" note. */
export function blueprintArgs(bp) {
  return {
    ...(bp.stages?.length ? { stages: bp.stages } : {}),
    ...(bp.custom_fields?.length ? { custom_fields: bp.custom_fields } : {}),
  };
}

export function formatPreview(data, text) {
  if (!data) return text || "(no preview returned)";
  const lines = [];
  if (data.stages?.length) {
    lines.push("Stages:");
    for (const s of data.stages) lines.push(`  ${s.action === "create" ? "+ add   " : "= exists"} ${s.name} (${s.group})`);
  }
  if (data.custom_fields?.length) {
    lines.push("Custom fields:");
    for (const f of data.custom_fields) lines.push(`  ${f.action === "create" ? "+ add   " : "= exists"} ${f.label} (${f.type}${f.options?.length ? `: ${f.options.join(", ")}` : ""})`);
  }
  for (const w of data.warnings ?? []) lines.push(`Warning: ${w}`);
  if (data.default_stages_added) lines.push("Note: the five default stages are written first so your pipeline keeps them.");
  if (text) lines.push(text);
  return lines.join("\n");
}

const toCreate = (data) => (data?.counts ? data.counts.stages_to_create + data.counts.fields_to_create : null);

/**
 * The whole flow. Dependencies are injected so tests and agents can drive it:
 *   client  { listTools(), call(name, args) }   ask(question) -> Promise<string>   log(line)
 * Returns the exit code: 0 done or nothing to do, 1 refused or failed, 2 declined.
 */
export async function runSetup({ client, blueprint, ask, log = console.log }) {
  const problems = validateBlueprint(blueprint);
  if (problems.length) { for (const p of problems) log(`Blueprint problem: ${p}`); return 1; }

  const tools = await client.listTools();
  const tool = tools.find((t) => t.name === TOOL);
  if (!tool) {
    log(`This server does not offer ${TOOL}. It may be an older server, or your token's scope hides it (it needs clients:write).`);
    log("Point WORKSPACE369_MCP_URL at https://mcp.workspace369.com/mcp/crm and use a token with the clients:write scope.");
    return 1;
  }
  const props = tool.inputSchema?.properties;
  if (props) {
    const missing = ["stages", "custom_fields", "dry_run"].filter((k) => !(k in props));
    if (missing.length) { log(`${TOOL} on this server has no argument named ${missing.join(", ")}. Update this script before applying.`); return 1; }
  }

  const schema = await client.call("workspace_schema", { record_types: ["clients"] });
  if (schema.isError) { log(`Could not read your pipeline: ${schema.text}`); return 1; }
  const clientsSchema = schema.data?.record_types?.find((r) => r.type === "clients");
  const stages = clientsSchema?.stages?.items ?? [];
  const fields = clientsSchema?.custom_field_definitions?.items ?? [];
  log("Current stages: " + (stages.length ? stages.map((s) => s.name).join(", ") : "none stored yet (the app shows its five defaults)"));
  log("Current client fields: " + (fields.length ? fields.map((f) => `${f.label} (${f.type})`).join(", ") : "none"));
  log("");

  const args = blueprintArgs(blueprint);
  log(`Proposed starter pipeline (${args.stages?.length ?? 0} stages, ${args.custom_fields?.length ?? 0} client fields). Edit config/crm-blueprint.json to change it.`);
  const dry = await client.call(TOOL, { ...args, dry_run: true });
  if (dry.isError) { log(`Refused: ${dry.text}`); return 1; }
  log("Dry run (nothing has been written):");
  log(formatPreview(dry.data, dry.text));
  log("");

  if (toCreate(dry.data) === 0) { log("Nothing to change. Your workspace already has all of this."); return 0; }

  const answer = (await ask("Apply these changes to your workspace? [y/N] ")).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") { log("Not applied. Nothing was changed."); return 2; }

  const done = await client.call(TOOL, { ...args, dry_run: false });
  if (done.isError) { log(`Refused: ${done.text}`); return 1; }
  log(formatPreview(done.data, done.text));
  log("Applied. Run `npm run dev` to see your pipeline.");
  return 0;
}

function loadEnvLocal() {
  try { process.loadEnvFile(path.resolve(".env.local")); } catch { /* no .env.local, or an older Node: use the shell environment */ }
}

function terminalAsk(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    let answered = false;
    rl.on("close", () => { if (!answered) resolve(""); }); // closed stdin counts as "no"
    rl.question(question, (a) => { answered = true; rl.close(); resolve(a); });
  });
}

async function main() {
  loadEnvLocal();
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--blueprint");
  const file = path.resolve(i >= 0 && argv[i + 1] ? argv[i + 1] : "config/crm-blueprint.json");
  const { token, url } = readConfig();
  if (!token) {
    console.error("Set WORKSPACE369_TOKEN (or W369_TOKEN) in .env.local or your shell. Create one in Workspace369 under Settings → AI → AI connections.");
    return 1;
  }
  let blueprint;
  try { blueprint = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error(`Could not read ${file}: ${e.message}`); return 1; }
  let host = url; try { host = new URL(url).host; } catch { /* keep the raw value */ }
  console.log(`Connecting to ${host}`);
  try {
    return await runSetup({ client: createClient({ token, url }), blueprint, ask: terminalAsk });
  } catch (e) {
    console.error(`Setup failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}

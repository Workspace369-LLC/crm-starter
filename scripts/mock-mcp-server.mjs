#!/usr/bin/env node
// Dev-only mock of the Workspace369 MCP endpoint, so the starter runs without an account.
// Speaks JSON-RPC over HTTP (tools/list, tools/call) and answers with the same shapes as the
// real Workspace369 MCP tools. State lives in memory and resets on restart.
// Run: node scripts/mock-mcp-server.mjs   (PORT=4010 by default)
// Then: W369_TOKEN=mock-token W369_MCP_URL=http://localhost:4010/mcp npm run dev
// Optional: MOCK_HOLD_WRITES=1 answers every write with a held_for_approval result.
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 4010);
const HOLD = process.env.MOCK_HOLD_WRITES === "1";
const DAY = 86_400_000;
const now = Date.now();
const iso = (daysAgo) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10);

const STAGES = [
  { id: "lead", name: "Lead", group: "lead" },
  { id: "quoted", name: "Quoted", group: "lead" },
  { id: "booked", name: "Booked", group: "client" },
  { id: "active", name: "Active", group: "client" },
  { id: "past", name: "Past", group: "closed" },
];
const FIELDS = [
  { id: "cf_vehicle_make", key: "vehicle_make", label: "Vehicle make", type: "text", options: [] },
  { id: "cf_package_tier", key: "package_tier", label: "Package tier", type: "select", options: ["Express", "Full detail", "Ceramic coating", "Fleet plan"] },
  { id: "cf_last_service", key: "last_service_date", label: "Last service date", type: "date", options: [] },
  { id: "cf_fleet", key: "fleet_account", label: "Fleet account", type: "boolean", options: [] },
];

// [name, company, email, phone, stage, source, tags, make, tier, lastServiceDaysAgo, fleet]
const SEED = [
  ["Maya Thompson", "", "maya.thompson@example.com", "+14155550101", "lead", "Instagram", ["mobile"], "Tesla", null, null, false],
  ["Daniel Ortiz", "", "daniel.ortiz@example.com", "+14155550102", "lead", "Google", [], "Ford", null, null, false],
  ["Priya Natarajan", "", "priya.n@example.com", "+14155550103", "quoted", "Referral", ["ceramic"], "BMW", "Ceramic coating", null, false],
  ["Greenline Couriers", "Greenline Couriers LLC", "ops@greenline.example.com", "+14155550104", "quoted", "Website", ["fleet"], "Ford Transit", "Fleet plan", null, true],
  ["Marcus Bell", "", "marcus.bell@example.com", "+14155550105", "booked", "Google", [], "Toyota", "Full detail", 190, false],
  ["Hannah Cho", "", "hannah.cho@example.com", "+14155550106", "booked", "Instagram", ["ceramic"], "Porsche", "Ceramic coating", 60, false],
  ["Brightside Realty", "Brightside Realty Inc.", "fleet@brightside.example.com", "+14155550107", "active", "Referral", ["fleet", "monthly"], "Honda CR-V", "Fleet plan", 12, true],
  ["Tom Gallagher", "", "tom.gallagher@example.com", "+14155550108", "active", "Walk-in", ["member"], "Subaru", "Full detail", 21, false],
  ["Olivia Reyes", "", "olivia.reyes@example.com", "+14155550109", "active", "Google", ["member"], "Audi", "Express", 9, false],
  ["Northbeam Design Studio", "Northbeam Design Studio LLC", "studio@northbeam.example.com", "+14155550110", "active", "Website", ["fleet"], "Volkswagen ID.4", "Fleet plan", 5, true],
  ["Kevin Walsh", "", "kevin.walsh@example.com", "+14155550111", "past", "Walk-in", [], "Mazda", "Express", 330, false],
  ["Rachel Kim", "", "rachel.kim@example.com", "+14155550112", "past", "Referral", [], "Volvo", "Full detail", 410, false],
];

const clients = new Map();
const proposals = [];
const invoices = [];
const idem = new Map();
const lifecycleOf = (stageId) => (STAGES.find((s) => s.id === stageId)?.group === "lead" ? "prospect" : "client");

function addClient({ name, company, email, phone, stage, source, tags, custom }) {
  const id = `cl_${randomUUID().slice(0, 8)}`;
  clients.set(id, {
    id, name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(company ? { company } : {}),
    client_type: company ? "business" : "individual", ...(source ? { lead_source: source } : {}),
    tags: tags ?? [], lifecycle_stage: lifecycleOf(stage), stage_id: stage, archived: false,
    email_opted_out: false, sms_opted_out: false, blacklisted: false, custom_fields: custom ?? {},
  });
  return id;
}
for (const [name, company, email, phone, stage, source, tags, make, tier, ago, fleet] of SEED) {
  addClient({ name, company, email, phone, stage, source, tags, custom: {
    vehicle_make: make, ...(tier ? { package_tier: tier } : {}), ...(ago != null ? { last_service_date: iso(ago) } : {}), fleet_account: fleet,
  } });
}
const byName = (n) => [...clients.values()].find((c) => c.name === n).id;
const prop = (client, title, status, total, ago) => proposals.push({
  id: `pr_${randomUUID().slice(0, 8)}`, title, status, client_id: byName(client), client_name: client, total, currency: "USD",
  ...(status !== "draft" ? { sent_at: now - ago * DAY } : {}), ...(status === "accepted" ? { viewed_at: now - (ago - 1) * DAY, accepted_at: now - (ago - 2) * DAY } : {}), is_archived: false,
});
prop("Priya Natarajan", "Ceramic coating, 3-year", "sent", 1450, 2);
prop("Greenline Couriers", "Fleet plan, 8 vans monthly", "sent", 2800, 4);
prop("Brightside Realty", "Monthly fleet detailing", "accepted", 960, 40);
prop("Hannah Cho", "Ceramic coating, Porsche 911", "accepted", 1800, 70);
const inv = (client, number, status, total, due, paid) => invoices.push({
  id: `in_${randomUUID().slice(0, 8)}`, number, status, client_id: byName(client), client_name: client, title: "Detailing services", total, currency: "USD",
  invoice_date: now - (due + 14) * DAY, due_date: now - due * DAY, balance_due: paid ? 0 : total, is_paid: paid, is_overdue: !paid && due > 0, is_archived: false,
});
inv("Brightside Realty", "INV-1041", "Paid", 960, 20, true);
inv("Northbeam Design Studio", "INV-1042", "Sent", 1240, 6, false);
inv("Tom Gallagher", "INV-1043", "Paid", 220, 25, true);
inv("Olivia Reyes", "INV-1044", "Sent", 90, -5, false);
inv("Hannah Cho", "INV-1045", "Paid", 900, 60, true);

// ---- tool wiring ---------------------------------------------------------------------------
const ok = (structuredContent, text) => ({ structuredContent, content: [{ type: "text", text }] });
const fail = (text) => ({ isError: true, content: [{ type: "text", text }] });
const held = (what) => {
  const id = randomUUID().replaceAll("-", "");
  return { structuredContent: { held_for_approval: true, approval_id: id, approval_url: `https://app.workspace369.com/settings/approvals/${id}`, approval_expires_at: new Date(now + 3 * DAY).toISOString() },
    content: [{ type: "text", text: `NOT DONE YET: ${what} is waiting for approval in the Workspace369 app (mock).` }] };
};
const strict = (args, allowed) => Object.keys(args).filter((k) => !allowed.includes(k));

function resolveStage(ref) {
  const w = String(ref).trim().toLowerCase();
  return STAGES.find((s) => s.id === ref) ?? STAGES.find((s) => s.name.toLowerCase() === w);
}

/** Mirrors clientCustomFields.ts: unknown key, bad type or option refuses the whole write. */
function resolveCustom(input, allowClear) {
  const set = {}, clear = [];
  for (const [name, raw] of Object.entries(input)) {
    const d = FIELDS.find((f) => f.key === name) ?? FIELDS.find((f) => f.label.toLowerCase() === name.trim().toLowerCase());
    if (!d) return { error: `Unknown custom field "${name}". Known field keys: ${FIELDS.map((f) => f.key).join(", ")}. Call \`workspace_schema\` to see the definitions.` };
    if (raw === null || raw === "") { if (allowClear) clear.push(d.key); continue; }
    const bad = (why) => ({ error: `Custom field "${d.key}" (${d.type}): ${why}` });
    if (d.type === "boolean" && typeof raw !== "boolean") return bad("value must be true or false.");
    if (d.type === "number" && (typeof raw !== "number" || !Number.isFinite(raw))) return bad("value must be a number.");
    if (d.type === "date" && !(typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)))) return bad("value must be a valid YYYY-MM-DD date.");
    if (d.type === "select" && !d.options.includes(raw)) return bad(`value must be one of: ${d.options.join(", ")}.`);
    if ((d.type === "text") && typeof raw !== "string") return bad("value must be a string.");
    set[d.key] = raw;
  }
  return { set, clear };
}

const listProjection = ({ custom_fields, email_opted_out, sms_opted_out, blacklisted, ...c }) => c; // clients_get only fields
const page = (rows, args, key) => {
  const limit = Math.min(Number(args.limit ?? 50), 100);
  const start = args.cursor ? Number(Buffer.from(String(args.cursor), "base64url").toString()) : 0;
  const slice = rows.slice(start, start + limit);
  const next = start + limit < rows.length ? Buffer.from(String(start + limit)).toString("base64url") : undefined;
  return ok({ [key]: slice, ...(next ? { nextCursor: next } : {}) }, `Found ${slice.length} ${key}.`);
};

const TOOLS = {
  clients_search: { props: ["query", "lead_source", "client_type", "stage", "tags", "limit", "cursor"], run(a) {
    let rows = [...clients.values()].filter((c) => !c.archived);
    if (a.query) rows = rows.filter((c) => `${c.name} ${c.email ?? ""} ${c.company ?? ""}`.toLowerCase().includes(String(a.query).toLowerCase()));
    if (a.lead_source) rows = rows.filter((c) => c.lead_source === a.lead_source);
    if (a.client_type) rows = rows.filter((c) => c.client_type === a.client_type);
    if (a.stage) { const s = resolveStage(a.stage); rows = rows.filter((c) => s && c.stage_id === s.id); }
    if (a.tags?.length) rows = rows.filter((c) => a.tags.some((t) => c.tags.includes(t)));
    return page(rows.map(listProjection), a, "clients");
  } },
  clients_get: { props: ["id"], run(a) {
    const c = clients.get(String(a.id ?? "").trim());
    return c ? ok({ client: c }, `Client "${c.name}".`) : ok({ client: null }, "Client not found or not in your scope.");
  } },
  clients_create: { write: true, props: ["name", "first_name", "last_name", "email", "phone", "company", "lead_source", "tags", "lifecycle_stage", "idempotency_key", "custom_fields"], run(a) {
    const extra = strict(a, TOOLS.clients_create.props); if (extra.length) return fail(`Invalid input: unknown field ${extra[0]}. No client was created.`);
    const name = String(a.name ?? [a.first_name, a.last_name].filter(Boolean).join(" ")).trim();
    if (!name) return fail("Invalid input: a `name` is required. No client was created.");
    if (a.lifecycle_stage && !["client", "prospect"].includes(a.lifecycle_stage)) return fail("Invalid input: `lifecycle_stage` is `client` or `prospect`. No client was created.");
    if (a.idempotency_key && idem.has(a.idempotency_key)) return ok({ client: clients.get(idem.get(a.idempotency_key)), deduped: true }, "Client already existed for this request (deduped).");
    const cf = a.custom_fields ? resolveCustom(a.custom_fields, false) : { set: {} };
    if (cf.error) return fail(`${cf.error} No client was created.`);
    const stage = a.lifecycle_stage === "prospect" ? "lead" : "active"; // effectiveStageId() in the real server
    const id = addClient({ name, company: a.company, email: a.email, phone: a.phone, stage, source: a.lead_source, tags: a.tags, custom: cf.set });
    if (a.idempotency_key) idem.set(a.idempotency_key, id);
    return ok({ client: clients.get(id), deduped: false }, `Created client "${name}".`);
  } },
  clients_update: { write: true, props: ["id", "name", "first_name", "last_name", "email", "phone", "company", "lead_source", "tags", "lifecycle_stage", "custom_fields"], run(a) {
    const extra = strict(a, TOOLS.clients_update.props); if (extra.length) return fail(`Invalid input: unknown field ${extra[0]}. No change was made.`);
    const c = clients.get(String(a.id ?? ""));
    if (!c) return fail("Client not found or not editable.");
    const cf = a.custom_fields ? resolveCustom(a.custom_fields, true) : { set: {}, clear: [] };
    if (cf.error) return fail(`${cf.error} No change was made.`);
    for (const k of ["name", "email", "phone", "company", "lead_source", "tags"]) if (a[k] !== undefined) c[k] = a[k];
    Object.assign(c.custom_fields, cf.set); for (const k of cf.clear) delete c.custom_fields[k];
    return ok({ client: c }, `Updated client "${c.name}".`);
  } },
  clients_move_stage: { write: true, props: ["id", "stage"], run(a) {
    if (!a.id || !a.stage || strict(a, ["id", "stage"]).length) return fail("Invalid input: a client `id` and a target `stage` are required. No change was made.");
    const c = clients.get(a.id); if (!c) return fail("Client not found or not editable.");
    const t = resolveStage(a.stage);
    if (!t) return fail(`Unknown stage "${a.stage}". Stages: ${STAGES.map((s) => `${s.name} (${s.id})`).join(", ")}. No change was made.`);
    const from = c.stage_id, moved = from !== t.id;
    c.stage_id = t.id; c.lifecycle_stage = lifecycleOf(t.id);
    return ok({ client: { id: c.id, name: c.name, stage_id: t.id, stage: t.name, lifecycle_stage: c.lifecycle_stage }, previous_stage_id: from, moved },
      moved ? `Moved "${c.name}" to ${t.name}.` : `"${c.name}" is already in ${t.name}. No change was made.`);
  } },
  workspace_schema: { props: ["record_types"], run(a) {
    const want = a.record_types ?? ["clients"];
    return ok({ workspace_id: "ws_mock_apex", record_types: want.map((type) => type === "clients"
      ? { type, stages: { available: true, items: STAGES }, custom_field_definitions: { available: true, items: FIELDS } } : { type }),
      notes: ["Mock workspace: Apex Auto Spa."] }, "Schema for clients.");
  } },
  /** Mirrors crm_apply_blueprint: dry_run defaults to true; all or nothing; keeps existing; deletes nothing. */
  crm_apply_blueprint: { props: ["stages", "custom_fields", "dry_run"], run(a) {
    const extra = strict(a, TOOLS.crm_apply_blueprint.props); if (extra.length) return fail(`Invalid input: unknown field ${extra[0]}. No change was made.`);
    if (process.env.MOCK_DENY_BLUEPRINT === "1") return fail("You do not have permission for this blueprint (needs clients.manage_stages, business_details.edit). Ask a workspace admin. No change was made.");
    const stages = a.stages ?? [], fields = a.custom_fields ?? [];
    if (!Array.isArray(stages) || !Array.isArray(fields) || (stages.length === 0 && fields.length === 0)) return fail("Invalid input: Give `stages` (up to 12) and/or `custom_fields` (up to 30). No change was made.");
    if (stages.length > 12) return fail("Invalid input: stages: at most 12. No change was made.");
    if (fields.length > 30) return fail("Invalid input: custom_fields: at most 30. No change was made.");
    const snake = (t) => String(t).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const stagePlan = [], fieldPlan = [], seen = new Set();
    for (const s of stages) {
      const id = s.id ?? snake(s.name);
      if (!s.name || !id) return fail("Invalid input: every stage needs a name. No change was made.");
      if (seen.has(id)) return fail(`Duplicate stage "${s.name}". No change was made.`); seen.add(id);
      const existing = STAGES.find((x) => x.id === id || x.name.toLowerCase() === String(s.name).toLowerCase());
      stagePlan.push({ id: existing?.id ?? id, name: existing?.name ?? s.name, group: existing?.group ?? s.group ?? "client", color: s.color ?? "gray", order: stagePlan.length, action: existing ? "exists" : "create" });
    }
    const keys = new Set();
    for (const f of fields) {
      const key = f.key ?? snake(f.label);
      if (!f.label || !key) return fail("Invalid input: every custom field needs a label. No change was made.");
      if (!["text", "select", "boolean", "number", "date"].includes(f.type)) return fail(`Invalid input: custom field "${f.label}" has an unknown type. No change was made.`);
      if (f.type === "select" && !(f.options?.length > 0)) return fail(`Custom field "${f.label}" is a select and needs options. No change was made.`);
      if (keys.has(key)) return fail(`Duplicate custom field key "${key}". No change was made.`); keys.add(key);
      const existing = FIELDS.find((x) => x.key === key);
      if (existing && existing.type !== f.type) return fail(`Custom field "${key}" already exists as ${existing.type}; a type change is refused. No change was made.`);
      fieldPlan.push({ key, label: existing?.label ?? f.label, type: f.type, options: f.options ?? [], action: existing ? "exists" : "create" });
    }
    const counts = {
      stages_to_create: stagePlan.filter((s) => s.action === "create").length, stages_existing: stagePlan.filter((s) => s.action === "exists").length,
      fields_to_create: fieldPlan.filter((f) => f.action === "create").length, fields_existing: fieldPlan.filter((f) => f.action === "exists").length,
    };
    const dryRun = a.dry_run !== false;
    if (!dryRun) {
      for (const s of stagePlan) if (s.action === "create") STAGES.push({ id: s.id, name: s.name, group: s.group });
      for (const f of fieldPlan) if (f.action === "create") FIELDS.push({ id: `cf_${f.key}`, key: f.key, label: f.label, type: f.type, options: f.options });
    }
    const total = counts.stages_to_create + counts.fields_to_create;
    const lead = dryRun ? "Preview only, nothing was written." : total > 0 ? "Done." : "Nothing to change.";
    const tail = dryRun && total > 0 ? " Call again with dry_run false to apply it." : "";
    return ok({ dry_run: dryRun, applied: !dryRun, stages: stagePlan, custom_fields: fieldPlan, counts, default_stages_added: false, warnings: [] },
      `${lead} ${counts.stages_to_create} stage(s) ${dryRun ? "to create" : "created"}, ${counts.stages_existing} already there; ${counts.fields_to_create} custom field(s) ${dryRun ? "to create" : "created"}, ${counts.fields_existing} already there.${tail}`);
  } },
  proposals_search: { props: ["clientId", "limit", "cursor"], run(a) {
    return page(proposals.filter((p) => !a.clientId || p.client_id === a.clientId), a, "proposals");
  } },
  proposals_create_draft: { write: true, props: ["client_id", "title", "idempotency_key"], run(a) {
    const c = clients.get(a.client_id); if (!c) return fail("Client not found.");
    if (a.idempotency_key && idem.has(a.idempotency_key)) return ok({ proposal: proposals.find((p) => p.id === idem.get(a.idempotency_key)), deduped: true }, "Draft already existed (deduped).");
    const p = { id: `pr_${randomUUID().slice(0, 8)}`, title: a.title, status: "draft", client_id: c.id, client_name: c.name, total: 0, currency: "USD", is_archived: false };
    proposals.push(p); if (a.idempotency_key) idem.set(a.idempotency_key, p.id);
    return ok({ proposal: { id: p.id, title: p.title, status: "draft", number: `P-${2000 + proposals.length}`, client_id: c.id }, deduped: false }, "Draft proposal created. Nothing was sent.");
  } },
  invoices_search: { props: ["clientId", "limit", "cursor"], run(a) {
    return page(invoices.filter((i) => !a.clientId || i.client_id === a.clientId), a, "invoices");
  } },
};

const toolList = () => Object.entries(TOOLS).map(([name, t]) => ({
  name, inputSchema: { type: "object", properties: Object.fromEntries(t.props.map((p) => [p, {}])) },
}));

function handle(msg) {
  if (msg.method === "tools/list") return { jsonrpc: "2.0", id: msg.id, result: { tools: toolList() } };
  if (msg.method === "tools/call") {
    const t = TOOLS[msg.params?.name];
    if (!t) return { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: `Unknown tool: ${msg.params?.name}` } };
    const args = msg.params.arguments ?? {};
    const result = t.write && HOLD ? held(msg.params.name) : t.run(args);
    return { jsonrpc: "2.0", id: msg.id, result };
  }
  return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
}

http.createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.startsWith("/mcp")) { res.writeHead(404).end(); return; }
  if (!/^Bearer \S+/.test(req.headers.authorization ?? "")) { res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "missing bearer token" })); return; }
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    let msg; try { msg = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
    const out = JSON.stringify(handle(msg));
    // The real server streams SSE when the client accepts it; mirror that so parseRpcBody's SSE path is exercised.
    if (String(req.headers.accept).includes("text/event-stream")) res.writeHead(200, { "content-type": "text/event-stream" }).end(`event: message\ndata: ${out}\n\n`);
    else res.writeHead(200, { "content-type": "application/json" }).end(out);
  });
}).listen(PORT, () => console.log(`Mock Workspace369 MCP (Apex Auto Spa) on http://localhost:${PORT}/mcp${HOLD ? " [writes held for approval]" : ""}`));

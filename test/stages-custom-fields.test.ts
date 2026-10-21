import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock replies mirror the real server shapes:
//  - workspace_schema: clients.stages / custom_field_definitions sections
//  - clients_move_stage: input {id, stage}; output {client:{id,name,stage_id,stage,lifecycle_stage}, previous_stage_id, moved}
//  - clients_create / clients_update `custom_fields`: output {client:{id,name,email?,phone?,company?}[, deduped]}
const calls: { method: string; name?: string; args?: Record<string, unknown> }[] = [];
const replies: Record<string, unknown[]> = {};
let toolsList: unknown[] = [];
let toolsListFails = false;
vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  if (body.method === "tools/list") {
    calls.push({ method: "tools/list" });
    if (toolsListFails) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: toolsList } }), { headers: { "content-type": "application/json" } });
  }
  const { params } = body;
  calls.push({ method: "tools/call", name: params.name, args: params.arguments });
  const sc = (replies[params.name] ?? []).shift();
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: sc, content: [] } }), { headers: { "content-type": "application/json" } });
}));
process.env.W369_TOKEN = "t";
import {
  capabilitiesFromTools, coerceCustomFields, createClient, customFieldFormValue, getCapabilities, getClient, getCustomFieldDefs,
  moveClientStage, updateClientCustomFields, type CustomFieldDef,
} from "@/lib/crm";

const defs: CustomFieldDef[] = [
  { id: "f1", key: "budget", label: "Budget", type: "number", options: [] },
  { id: "f2", key: "tier", label: "Tier", type: "select", options: ["gold", "silver"] },
  { id: "f3", key: "renewal", label: "Renewal", type: "date", options: [] },
  { id: "f4", key: "vip", label: "VIP", type: "boolean", options: [] },
  { id: "f5", key: "notes_text", label: "Notes", type: "text", options: [] },
];

beforeEach(() => { calls.length = 0; toolsListFails = false; toolsList = []; for (const k of Object.keys(replies)) delete replies[k]; });

describe("capabilities from tools/list", () => {
  const withCf = { properties: { id: {}, custom_fields: {} } };
  it("detects both features when deployed", () => {
    expect(capabilitiesFromTools([
      { name: "clients_move_stage" },
      { name: "clients_create", inputSchema: withCf },
      { name: "clients_update", inputSchema: withCf },
    ])).toEqual({ moveStage: true, customFields: true });
  });
  it("hides both when the server lacks the stage and custom field tools", () => {
    expect(capabilitiesFromTools([
      { name: "clients_create", inputSchema: { properties: { name: {} } } },
      { name: "clients_update", inputSchema: { properties: { id: {} } } },
    ])).toEqual({ moveStage: false, customFields: false });
  });
  it("getCapabilities reads tools/list and degrades to off if it fails", async () => {
    toolsList = [{ name: "clients_move_stage" }];
    expect(await getCapabilities()).toEqual({ moveStage: true, customFields: false });
    toolsListFails = true;
    expect(await getCapabilities()).toEqual({ moveStage: false, customFields: false });
  });
});

describe("workspace_schema custom field definitions", () => {
  it("reads custom_field_definitions.items; null when the section is unavailable", async () => {
    replies.workspace_schema = [
      { record_types: [{ type: "clients", custom_field_definitions: { available: true, items: [{ id: "f2", key: "tier", label: "Tier", type: "select", options: ["gold"] }] } }] },
      { record_types: [{ type: "clients", custom_field_definitions: { available: false, reason: "no permission" } }] },
    ];
    expect(await getCustomFieldDefs()).toEqual([{ id: "f2", key: "tier", label: "Tier", type: "select", options: ["gold"] }]);
    expect(calls[0].args).toEqual({ record_types: ["clients"] });
    expect(await getCustomFieldDefs()).toBeNull();
  });
});

describe("clients_move_stage", () => {
  it("sends {id, stage} and returns the moved shape", async () => {
    replies.clients_move_stage = [{ client: { id: "c1", name: "Acme", stage_id: "active", stage: "Active", lifecycle_stage: "client" }, previous_stage_id: "lead", moved: true }];
    const r = await moveClientStage("c1", "active");
    expect(calls[0]).toEqual({ method: "tools/call", name: "clients_move_stage", args: { id: "c1", stage: "active" } });
    expect(r).toMatchObject({ held: false, data: { moved: true, previous_stage_id: "lead", client: { stage: "Active" } } });
  });
  it("surfaces a held result", async () => {
    replies.clients_move_stage = [{ held_for_approval: true, approval_id: "a1", approval_url: "https://app.workspace369.com/approvals/a1" }];
    const r = await moveClientStage("c1", "active");
    expect(r).toMatchObject({ held: true, approval: { approval_id: "a1" } });
  });
});

describe("custom_fields on clients_create / clients_update", () => {
  it("update sends {id, custom_fields}", async () => {
    replies.clients_update = [{ client: { id: "c1", name: "Acme" } }];
    await updateClientCustomFields("c1", { budget: 5000, tier: "gold" });
    expect(calls[0].args).toEqual({ id: "c1", custom_fields: { budget: 5000, tier: "gold" } });
  });
  it("create omits an empty custom_fields and passes idempotency_key", async () => {
    replies.clients_create = [{ client: { id: "c2", name: "Beta" }, deduped: false }];
    await createClient({ name: "Beta", custom_fields: {} }, "k1");
    expect(calls[0].args).toEqual({ name: "Beta", idempotency_key: "k1" });
  });
  it("create passes custom_fields when present", async () => {
    replies.clients_create = [{ client: { id: "c2", name: "Beta" }, deduped: false }];
    await createClient({ name: "Beta", company: "B Ltd", custom_fields: { vip: true } });
    expect(calls[0].args).toEqual({ name: "Beta", company: "B Ltd", custom_fields: { vip: true } });
  });
});

describe("coerceCustomFields follows the server per-type rules", () => {
  it("types values and skips blanks", () => {
    expect(coerceCustomFields(defs, { budget: "5000", tier: "gold", renewal: "2026-12-01", vip: "false", notes_text: " hi ", }))
      .toEqual({ ok: true, values: { budget: 5000, tier: "gold", renewal: "2026-12-01", vip: false, notes_text: "hi" } });
    expect(coerceCustomFields(defs, { budget: "", tier: "" })).toEqual({ ok: true, values: {} });
  });
  it.each([
    [{ budget: "abc" }, "Budget must be a number."],
    [{ tier: "bronze" }, "Tier: pick one of gold, silver."],
    [{ renewal: "01/12/2026" }, "Renewal must be a date (YYYY-MM-DD)."],
    [{ vip: "maybe" }, "VIP must be yes or no."],
  ])("rejects %j", (raw, error) => {
    expect(coerceCustomFields(defs, raw)).toEqual({ ok: false, error });
  });
});

describe("current custom field values (clients_get)", () => {
  it("getClient passes custom_fields and custom_fields_unavailable through", async () => {
    replies.clients_get = [
      { client: { id: "c1", name: "Acme", stage_id: "s2", custom_fields: { budget: 5000, vip: true } } },
      { client: { id: "c2", name: "Beta", custom_fields_unavailable: true } },
    ];
    expect((await getClient("c1"))?.custom_fields).toEqual({ budget: 5000, vip: true });
    expect((await getClient("c2"))?.custom_fields_unavailable).toBe(true);
    expect(calls.map((c) => c.args)).toEqual([{ id: "c1" }, { id: "c2" }]);
  });
  it("turns stored values into form strings", () => {
    const [budget, tier, renewal, vip, text] = defs;
    expect(customFieldFormValue(budget, 5000)).toBe("5000");
    expect(customFieldFormValue(tier, "gold")).toBe("gold");
    expect(customFieldFormValue(renewal, "2026-12-01")).toBe("2026-12-01");
    expect(customFieldFormValue(vip, false)).toBe("false");
    expect(customFieldFormValue(vip, true)).toBe("true");
    expect(customFieldFormValue(text, undefined)).toBe("");
  });
});

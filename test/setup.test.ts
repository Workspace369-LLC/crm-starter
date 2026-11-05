import { describe, expect, it, vi } from "vitest";
import { blueprintArgs, createClient, formatPreview, readConfig, runSetup, validateBlueprint, type SetupClient } from "../scripts/setup.mjs";

const blueprint = {
  _comment: "ignored",
  stages: [{ name: "Lead", group: "lead", color: "blue" }, { name: "Qualified", group: "lead" }],
  custom_fields: [{ label: "Budget", type: "number" }],
};

const schemaReply = {
  isError: false, text: "",
  data: { record_types: [{ type: "clients", stages: { available: true, items: [{ id: "lead", name: "Lead", group: "lead" }] }, custom_field_definitions: { available: true, items: [] } }] },
};
const preview = (dry: boolean) => ({
  isError: false,
  text: dry ? "Preview only, nothing was written. 1 stage(s) to create." : "Done. 1 stage(s) created.",
  data: {
    dry_run: dry, applied: !dry,
    stages: [{ id: "lead", name: "Lead", group: "lead", action: "exists" }, { id: "qualified", name: "Qualified", group: "lead", action: "create" }],
    custom_fields: [{ key: "budget", label: "Budget", type: "number", options: [], action: "create" }],
    counts: { stages_to_create: 1, stages_existing: 1, fields_to_create: 1, fields_existing: 0 }, warnings: [],
  },
});

function fakeClient(over: Partial<Record<string, (args: Record<string, unknown>) => unknown>> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client: SetupClient = {
    listTools: async () => [{ name: "crm_apply_blueprint", inputSchema: { properties: { stages: {}, custom_fields: {}, dry_run: {} } } }, { name: "workspace_schema" }],
    call: async (name, args) => {
      calls.push({ name, args });
      if (over[name]) return over[name]!(args) as never;
      if (name === "workspace_schema") return schemaReply;
      return preview(args.dry_run !== false);
    },
  };
  return { client, calls, applies: () => calls.filter((c) => c.name === "crm_apply_blueprint") };
}

describe("runSetup", () => {
  it("dry run, then decline: no apply call", async () => {
    const f = fakeClient();
    const log = vi.fn();
    const code = await runSetup({ client: f.client, blueprint, ask: async () => "n", log });
    expect(code).toBe(2);
    expect(f.applies()).toHaveLength(1);
    expect(f.applies()[0].args.dry_run).toBe(true);
    expect(log.mock.calls.flat().join("\n")).toContain("Not applied");
  });

  it("treats an empty answer (closed stdin) as no", async () => {
    const f = fakeClient();
    expect(await runSetup({ client: f.client, blueprint, ask: async () => "", log: () => {} })).toBe(2);
    expect(f.applies()).toHaveLength(1);
  });

  it("dry run, then yes: exactly one apply call with dry_run false", async () => {
    const f = fakeClient();
    const ask = vi.fn(async () => "y");
    const code = await runSetup({ client: f.client, blueprint, ask, log: () => {} });
    expect(code).toBe(0);
    expect(ask).toHaveBeenCalledTimes(1);
    const applies = f.applies();
    expect(applies).toHaveLength(2);
    expect(applies[0].args.dry_run).toBe(true);
    expect(applies[1].args.dry_run).toBe(false);
    expect(applies[1].args.stages).toEqual(blueprint.stages);
    expect(applies[1].args).not.toHaveProperty("_comment");
  });

  it("shows the current schema and the preview before asking", async () => {
    const f = fakeClient();
    const log = vi.fn();
    await runSetup({ client: f.client, blueprint, ask: async () => "n", log });
    const out = log.mock.calls.flat().join("\n");
    expect(out).toContain("Current stages: Lead");
    expect(out).toContain("+ add    Qualified");
    expect(out).toContain("= exists Lead");
  });

  it("a refused dry run prints the reason and never asks or applies", async () => {
    const f = fakeClient({ crm_apply_blueprint: () => ({ isError: true, text: "You do not have permission for this blueprint (needs clients.manage_stages). No change was made." }) });
    const log = vi.fn();
    const ask = vi.fn(async () => "y");
    const code = await runSetup({ client: f.client, blueprint, ask, log });
    expect(code).toBe(1);
    expect(ask).not.toHaveBeenCalled();
    expect(f.applies()).toHaveLength(1);
    expect(log.mock.calls.flat().join("\n")).toContain("Refused: You do not have permission for this blueprint");
  });

  it("a refused apply prints the reason", async () => {
    let n = 0;
    const f = fakeClient({ crm_apply_blueprint: (a) => (++n === 1 ? preview(true) : { isError: true, text: "Custom field \"budget\" already exists as text. No change was made." }) });
    const log = vi.fn();
    const code = await runSetup({ client: f.client, blueprint, ask: async () => "y", log });
    expect(code).toBe(1);
    expect(log.mock.calls.flat().join("\n")).toContain("Refused: Custom field \"budget\" already exists as text");
  });

  it("nothing to change: no prompt", async () => {
    const none = { isError: false, text: "Preview only.", data: { stages: [], custom_fields: [], counts: { stages_to_create: 0, stages_existing: 2, fields_to_create: 0, fields_existing: 1 }, warnings: [] } };
    const f = fakeClient({ crm_apply_blueprint: () => none });
    const ask = vi.fn(async () => "y");
    expect(await runSetup({ client: f.client, blueprint, ask, log: () => {} })).toBe(0);
    expect(ask).not.toHaveBeenCalled();
    expect(f.applies()).toHaveLength(1);
  });

  it("stops when the server has no crm_apply_blueprint (older server or scoped token)", async () => {
    const f = fakeClient();
    f.client.listTools = async () => [{ name: "workspace_schema" }];
    const log = vi.fn();
    expect(await runSetup({ client: f.client, blueprint, ask: async () => "y", log })).toBe(1);
    expect(f.calls).toHaveLength(0);
    expect(log.mock.calls.flat().join("\n")).toContain("does not offer crm_apply_blueprint");
  });

  it("stops when tools/list shows different argument names", async () => {
    const f = fakeClient();
    f.client.listTools = async () => [{ name: "crm_apply_blueprint", inputSchema: { properties: { stages: {}, dry_run: {} } } }];
    expect(await runSetup({ client: f.client, blueprint, ask: async () => "y", log: () => {} })).toBe(1);
    expect(f.calls).toHaveLength(0);
  });
});

describe("blueprint helpers", () => {
  it("validates caps and selects", () => {
    expect(validateBlueprint(blueprint)).toEqual([]);
    expect(validateBlueprint({ stages: Array.from({ length: 13 }, (_, i) => ({ name: `s${i}` })) })[0]).toContain("At most 12");
    expect(validateBlueprint({ custom_fields: [{ label: "X", type: "select" }] })[0]).toContain("needs options");
    expect(validateBlueprint({})[0]).toContain("no stages");
  });
  it("sends only stages and custom_fields", () => {
    expect(Object.keys(blueprintArgs(blueprint))).toEqual(["stages", "custom_fields"]);
  });
  it("formats the preview", () => {
    expect(formatPreview(undefined, "plain")).toBe("plain");
  });
});

describe("config and transport", () => {
  it("reads W369_* first, then WORKSPACE369_*, then the default URL", () => {
    expect(readConfig({ WORKSPACE369_TOKEN: "a", WORKSPACE369_MCP_URL: "http://x" })).toEqual({ token: "a", url: "http://x" });
    expect(readConfig({ W369_TOKEN: "b", WORKSPACE369_TOKEN: "a" }).token).toBe("b");
    expect(readConfig({ W369_TOKEN: "b" }).url).toBe("https://mcp.workspace369.com/mcp/crm");
  });
  it("sends the token as a bearer header and never leaks it in errors", async () => {
    const fetchImpl = vi.fn(async (_u: unknown, init: { headers: Record<string, string> }) => {
      expect(init.headers.Authorization).toBe("Bearer secret-token");
      return new Response("bad secret-token", { status: 401 });
    });
    const c = createClient({ token: "secret-token", url: "http://x", fetchImpl: fetchImpl as never });
    await expect(c.listTools()).rejects.toThrow(/HTTP 401: bad \*\*\*/);
  });
  it("parses an SSE reply and returns a refusal as a value", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "nope secret-token" }] } });
    const fetchImpl = async () => new Response(`event: message\ndata: ${body}\n\n`, { headers: { "content-type": "text/event-stream" } });
    const c = createClient({ token: "secret-token", url: "http://x", fetchImpl: fetchImpl as never });
    expect(await c.call("crm_apply_blueprint", {})).toMatchObject({ isError: true, text: "nope ***" });
  });
});

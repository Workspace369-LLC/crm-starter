import { describe, expect, it, vi, beforeEach } from "vitest";

const calls: { name: string; args: Record<string, unknown> }[] = [];
const replies: Record<string, unknown[]> = {};
vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
  const { params } = JSON.parse(init.body);
  calls.push({ name: params.name, args: params.arguments });
  const sc = (replies[params.name] ?? []).shift();
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: sc, content: [] } }), { headers: { "content-type": "application/json" } });
}));
process.env.W369_TOKEN = "t";
import { draftProposal, getClient, getClientStages, listClients, listInvoices, listProposals } from "@/lib/crm";

beforeEach(() => { calls.length = 0; for (const k of Object.keys(replies)) delete replies[k]; });

describe("crm helpers use the server schemas", () => {
  it("pages clients_search with limit/cursor and reads `clients`", async () => {
    replies.clients_search = [{ clients: [{ id: "a", name: "A" }], nextCursor: "c1" }, { clients: [{ id: "b", name: "B" }] }];
    const r = await listClients();
    expect(r.map((c) => c.id)).toEqual(["a", "b"]);
    expect(calls[0].args).toEqual({ limit: 100 });
    expect(calls[1].args).toEqual({ limit: 100, cursor: "c1" });
  });
  it("clients_get unwraps `client` and can be null", async () => {
    replies.clients_get = [{ client: { id: "a", name: "A" } }, { client: null }];
    expect((await getClient("a"))?.name).toBe("A");
    expect(calls[0].args).toEqual({ id: "a" });
    expect(await getClient("zz")).toBeNull();
  });
  it("proposals/invoices filter by camelCase clientId", async () => {
    replies.proposals_search = [{ proposals: [{ id: "p" }] }];
    replies.invoices_search = [{ invoices: [{ id: "i" }] }];
    expect(await listProposals("c1")).toHaveLength(1);
    expect(await listInvoices("c1")).toHaveLength(1);
    expect(calls[0].args).toMatchObject({ clientId: "c1" });
    expect(calls[1].args).toMatchObject({ clientId: "c1" });
  });
  it("workspace_schema stages come from record_types[clients].stages", async () => {
    replies.workspace_schema = [{ record_types: [{ type: "clients", stages: { available: true, items: [{ id: "s", name: "Lead", group: "prospect" }] } }] }, { record_types: [{ type: "clients", stages: { available: false, reason: "no permission" } }] }];
    expect(await getClientStages()).toEqual([{ id: "s", name: "Lead", group: "prospect" }]);
    expect(calls[0].args).toEqual({ record_types: ["clients"] });
    expect(await getClientStages()).toBeNull();
  });
  it("draftProposal sends client_id/title/idempotency_key and returns the proposal", async () => {
    replies.proposals_create_draft = [{ proposal: { id: "p1", status: "Draft" }, deduped: false }];
    const r = await draftProposal("c1", "T", "k1");
    expect(calls[0]).toEqual({ name: "proposals_create_draft", args: { client_id: "c1", title: "T", idempotency_key: "k1" } });
    expect(r).toMatchObject({ held: false, data: { proposal: { id: "p1" } } });
  });
});

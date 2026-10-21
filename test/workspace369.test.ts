import { describe, expect, it, vi } from "vitest";
import { callTool, W369Error } from "@/lib/workspace369";

const mk = (body: string, type: string, status = 200) =>
  vi.fn(async () => new Response(body, { status, headers: { "content-type": type } })) as unknown as typeof fetch;
const ok = (sc: unknown) => ({ jsonrpc: "2.0", id: 1, result: { structuredContent: sc, content: [{ type: "text", text: "x" }] } });

describe("callTool", () => {
  it("parses a JSON reply and sends the right request", async () => {
    const f = mk(JSON.stringify(ok({ clients: [1] })), "application/json");
    const r = await callTool("clients_search", { query: "a" }, { token: "t", fetchImpl: f });
    expect(r).toEqual({ held: false, data: { clients: [1] } });
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toBe("https://mcp.workspace369.com/mcp");
    expect(init.headers.Authorization).toBe("Bearer t");
    expect(init.headers.Accept).toBe("application/json, text/event-stream");
    expect(JSON.parse(init.body)).toMatchObject({ method: "tools/call", params: { name: "clients_search", arguments: { query: "a" } } });
  });
  it("parses an SSE reply", async () => {
    const f = mk(`event: message\ndata: ${JSON.stringify(ok({ a: 1 }))}\n\n`, "text/event-stream");
    expect(await callTool("x", {}, { token: "t", fetchImpl: f })).toEqual({ held: false, data: { a: 1 } });
  });
  it("throws on isError results", async () => {
    const f = mk(JSON.stringify({ result: { isError: true, content: [{ type: "text", text: "nope" }] } }), "application/json");
    await expect(callTool("x", {}, { token: "t", fetchImpl: f })).rejects.toMatchObject({ kind: "tool", message: "nope" });
  });
  it("returns held-for-approval results without throwing", async () => {
    const f = mk(JSON.stringify(ok({ held_for_approval: true, approval_id: "ap1", approval_url: "https://app/ap1" })), "application/json");
    const r = await callTool("proposals_send", {}, { token: "t", fetchImpl: f });
    expect(r).toMatchObject({ held: true, approval: { approval_id: "ap1", approval_url: "https://app/ap1" } });
  });
  it("throws on HTTP errors and missing token", async () => {
    await expect(callTool("x", {}, { token: "t", fetchImpl: mk("{}", "application/json", 401) })).rejects.toMatchObject({ kind: "http", status: 401 });
    delete process.env.W369_TOKEN;
    await expect(callTool("x")).rejects.toBeInstanceOf(W369Error);
  });
});

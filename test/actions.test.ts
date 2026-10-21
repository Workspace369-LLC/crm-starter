import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const sent: { name: string; args: Record<string, unknown> }[] = [];
vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
  const { params } = JSON.parse(init.body);
  sent.push({ name: params.name, args: params.arguments });
  const sc =
    params.name === "workspace_schema"
      ? { record_types: [{ type: "clients", custom_field_definitions: { available: true, items: [] } }] }
      : { client: { id: "cl_9", name: "Jordan Pierce" }, deduped: false };
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: sc, content: [] } }), { headers: { "content-type": "application/json" } });
}));
process.env.W369_TOKEN = "t";
import { createClientAction } from "@/app/actions";
import { initials, money, pillClass } from "@/app/status";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

beforeEach(() => { sent.length = 0; });

describe("createClientAction", () => {
  it("sends the chosen lifecycle stage and links to the new client", async () => {
    const r = await createClientAction(null, form({ name: "Jordan Pierce", lifecycle_stage: "prospect" }));
    expect(sent.find((s) => s.name === "clients_create")?.args.lifecycle_stage).toBe("prospect");
    expect(r).toEqual({ message: "Created Jordan Pierce.", href: "/clients/cl_9" });
  });
  it("defaults to client and ignores unknown values", async () => {
    await createClientAction(null, form({ name: "A", lifecycle_stage: "bogus" }));
    expect(sent.find((s) => s.name === "clients_create")?.args.lifecycle_stage).toBe("client");
  });
  it("requires a name", async () => {
    expect(await createClientAction(null, form({ name: " " }))).toEqual({ message: "Name is required." });
  });
});

describe("status helpers", () => {
  it("maps statuses to pill classes", () => {
    expect(pillClass("Paid")).toBe("pill ok");
    expect(pillClass("Sent", true)).toBe("pill bad");
    expect(pillClass(undefined)).toBe("pill");
  });
  it("initials and money", () => {
    expect(initials("Maya Thompson")).toBe("MT");
    expect(money(1450)).toBe("$1,450");
    expect(money(null)).toBe("");
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

// Replies mirror the real tools: pipeline_summary and follow_ups_list output shapes, follow_ups_create / _complete inputs.
const calls: { name: string; args: Record<string, unknown> }[] = [];
const replies: Record<string, unknown> = {};
let failing = new Set<string>();
vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
  const { params } = JSON.parse(init.body);
  calls.push({ name: params.name, args: params.arguments });
  if (failing.has(params.name)) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "Not allowed" }] } }), { headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { structuredContent: replies[params.name], content: [] } }), { headers: { "content-type": "application/json" } });
}));
process.env.W369_TOKEN = "t";

import {
  capabilitiesFromTools, completeFollowUp, createFollowUp, getNextFollowUp, getPipelineSummary,
  type Capabilities, type FollowUp, type PipelineSummary,
} from "@/lib/crm";
import { createFollowUpAction, completeFollowUpAction } from "@/app/actions";
import { PipelineHeader } from "@/app/pipeline-header";
import { FollowUpPanel, followUpView } from "@/app/clients/[id]/followups";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ALL = ["pipeline_summary", "follow_ups_list", "follow_ups_create", "follow_ups_complete"].map((name) => ({ name }));
const off: Capabilities = { moveStage: false, customFields: false, pipelineSummary: false, followUps: false, followUpCreate: false, followUpComplete: false };
const on: Capabilities = { ...off, pipelineSummary: true, followUps: true, followUpCreate: true, followUpComplete: true };

const summary: PipelineSummary = {
  stages: [{ id: "lead", name: "Lead", group: "lead", client_count: 4 }, { id: "active", name: "Active", group: "client", client_count: null }],
  total_clients: 9,
  new_clients: { last_7_days: 2, last_30_days: 5 },
  stalled: { days: 14, count: 2, clients: [{ id: "c1", name: "Priya Natarajan" }, { id: "c2", name: "Greenline Couriers" }] },
};
const reminder: FollowUp = { client_id: "c1", client_name: "Priya", group: "overdue", type: "reminder", title: "Call about the quote", reason: "Reminder: Call about the quote", due_at: "2026-11-01T09:00:00.000Z", channel: "call", source: "reminder", source_ref: { kind: "reminder", id: "r1" } };
const chase: FollowUp = { ...reminder, client_id: "c2", type: "chase_proposal", title: "Chase proposal", source: "signal", source_ref: { kind: "proposal", id: "p1" } };

beforeEach(() => { calls.length = 0; failing = new Set(); for (const k of Object.keys(replies)) delete replies[k]; });

describe("feature detect from tools/list", () => {
  it("turns each feature on only when its tool is listed", () => {
    expect(capabilitiesFromTools(ALL)).toMatchObject({ pipelineSummary: true, followUps: true, followUpCreate: true, followUpComplete: true });
    expect(capabilitiesFromTools([])).toMatchObject({ pipelineSummary: false, followUps: false, followUpCreate: false, followUpComplete: false });
    expect(capabilitiesFromTools([{ name: "follow_ups_list" }])).toMatchObject({ followUps: true, followUpCreate: false, followUpComplete: false, pipelineSummary: false });
  });
});

describe("read helpers degrade quietly", () => {
  it("getPipelineSummary returns the summary, and null when the call is refused", async () => {
    replies.pipeline_summary = summary;
    expect(await getPipelineSummary()).toEqual(summary);
    failing.add("pipeline_summary");
    expect(await getPipelineSummary()).toBeNull();
  });
  it("getNextFollowUp picks this client's item from the list, and null otherwise", async () => {
    replies.follow_ups_list = { items: [chase, reminder] };
    expect(await getNextFollowUp("c1")).toEqual(reminder);
    expect(calls[0]).toEqual({ name: "follow_ups_list", args: { limit: 100 } });
    expect(await getNextFollowUp("nobody")).toBeNull();
    failing.add("follow_ups_list");
    expect(await getNextFollowUp("c1")).toBeNull();
  });
});

describe("write helpers and server actions", () => {
  it("sends the tool's argument names", async () => {
    replies.follow_ups_create = { follow_up: { id: "r9", title: "T", due_at: "x" }, deduped: false };
    await createFollowUp({ client_id: "c1", title: "T", due: "2026-12-01", channel: "call" }, "k1");
    expect(calls[0]).toEqual({ name: "follow_ups_create", args: { client_id: "c1", title: "T", due: "2026-12-01", channel: "call", idempotency_key: "k1" } });
    replies.follow_ups_complete = { follow_up: { id: "r1", title: "T" }, completed: true };
    await completeFollowUp("c1", "r1");
    expect(calls[1]).toEqual({ name: "follow_ups_complete", args: { client_id: "c1", follow_up_id: "r1" } });
  });
  const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  it("createFollowUpAction validates, calls the tool and reports", async () => {
    expect(await createFollowUpAction(null, form({ clientId: "c1", title: " ", due: "" }))).toEqual({ message: "Add what to do and a due date." });
    expect(calls).toHaveLength(0);
    replies.follow_ups_create = { follow_up: { id: "r9", title: "T", due_at: "x" }, deduped: false };
    expect(await createFollowUpAction(null, form({ clientId: "c1", title: "Call", due: "2026-12-01", channel: "bogus", key: "k" }))).toEqual({ message: "Follow-up scheduled." });
    expect(calls[0].args).toEqual({ client_id: "c1", title: "Call", due: "2026-12-01", idempotency_key: "k" });
  });
  it("shows the server's reason when a write is refused", async () => {
    failing.add("follow_ups_complete");
    expect(await completeFollowUpAction(null, form({ clientId: "c1", followUpId: "r1" }))).toEqual({ message: "Not allowed" });
  });
  it("shows the approval link when a write is held", async () => {
    replies.follow_ups_complete = { held_for_approval: true, approval_id: "a", approval_url: "https://example.test/a" };
    expect(await completeFollowUpAction(null, form({ clientId: "c1", followUpId: "r1" }))).toEqual({ message: "Awaiting approval in Workspace369.", approvalUrl: "https://example.test/a" });
  });
});

describe("render", () => {
  it("PipelineHeader shows stage counts, new and stalled; unknown counts show a dash", () => {
    const html = renderToStaticMarkup(createElement(PipelineHeader, { summary }));
    expect(html).toContain("Lead <strong>4</strong>");
    expect(html).toContain("Active <strong>-</strong>");
    expect(html).toContain("<strong>2</strong> in 7 days");
    expect(html).toContain("Stalled (14+ days in a stage): <strong>2</strong>");
    expect(html).toContain("Priya Natarajan, Greenline Couriers");
  });
  it("FollowUpPanel with every tool: next follow-up, Mark done and Schedule", () => {
    const html = renderToStaticMarkup(createElement(FollowUpPanel, { clientId: "c1", caps: on, next: reminder }));
    expect(html).toContain("Call about the quote");
    expect(html).toContain("Overdue");
    expect(html).toContain("Mark done");
    expect(html).toContain("Schedule");
  });
  it("hides Mark done for follow-ups the server computes (only reminders can be closed)", () => {
    const html = renderToStaticMarkup(createElement(FollowUpPanel, { clientId: "c2", caps: on, next: chase }));
    expect(html).toContain("Chase proposal");
    expect(html).not.toContain("Mark done");
  });
  it("hides each part whose tool is missing, and the whole panel when none are offered", () => {
    expect(renderToStaticMarkup(createElement(FollowUpPanel, { clientId: "c1", caps: off, next: null }))).toBe("");
    const noCreate = renderToStaticMarkup(createElement(FollowUpPanel, { clientId: "c1", caps: { ...on, followUpCreate: false, followUpComplete: false }, next: reminder }));
    expect(noCreate).toContain("Call about the quote");
    expect(noCreate).not.toContain("Schedule");
    expect(noCreate).not.toContain("Mark done");
    const onlyCreate = renderToStaticMarkup(createElement(FollowUpPanel, { clientId: "c1", caps: { ...off, followUpCreate: true }, next: null }));
    expect(onlyCreate).toContain("Schedule");
    expect(onlyCreate).not.toContain("Next follow-up</h2></div><p");
    expect(followUpView(off, reminder)).toMatchObject({ panel: false, list: false, canComplete: false, canCreate: false });
  });
  it("shows an empty state when there is no next follow-up", () => {
    expect(renderToStaticMarkup(createElement(FollowUpPanel, { clientId: "c1", caps: on, next: null }))).toContain("No follow-up scheduled.");
  });
});

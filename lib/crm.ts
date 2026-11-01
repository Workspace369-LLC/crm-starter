import "server-only";
import { callTool, listTools, readTool, type CallResult, type ToolInfo } from "./workspace369";

// Names and shapes below come from the Workspace369 MCP tool schemas
// (clients, proposals, invoices, workspace_schema). Run `tools/list` for your workspace's live schemas.

/** clients_search / clients_get row. `lifecycle_stage` is "prospect" or "client". */
export type Client = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  client_type?: string;
  lead_source?: string;
  tags?: string[];
  lifecycle_stage?: string;
  /** Pipeline stage id (clients_search / clients_get). */
  stage_id?: string;
  archived?: boolean;
  /** clients_get only: current values keyed by definition key. Missing keys have no value. */
  custom_fields?: Record<string, string | number | boolean>;
  /** clients_get only: true when the field definitions could not be read, so `custom_fields` is left out. */
  custom_fields_unavailable?: boolean;
};
/** proposals_search row. Timestamps are numbers; `total` is null without invoices.view_prices. */
export type Proposal = {
  id: string;
  title?: string;
  status?: string;
  client_id?: string;
  client_name?: string;
  total?: number | null;
  currency?: string;
  sent_at?: number;
  viewed_at?: number;
  accepted_at?: number;
  declined_at?: number;
  opened_by_client?: boolean;
  is_archived?: boolean;
};
/** invoices_search row. There is no "Overdue" status: use `is_overdue`. */
export type Invoice = {
  id: string;
  number?: string;
  status?: string;
  client_id?: string;
  client_name?: string;
  title?: string;
  total?: number | null;
  currency?: string;
  invoice_date?: number;
  due_date?: number;
  balance_due?: number | null;
  is_paid?: boolean;
  is_overdue?: boolean;
  is_archived?: boolean;
};
/** proposals_create_draft result. */
export type DraftedProposal = { id: string; title?: string; status?: string; number?: string; client_id?: string };
/** Client stage from workspace_schema. `group` is "lead" | "client" | "closed". */
export type Stage = { id: string; name: string; group: string };
/** Client custom field definition from workspace_schema (definitions only, never values). `type`: text | number | boolean | date | select. */
export type CustomFieldDef = { id: string; key: string; label: string; type: string; options: string[] };
/** clients_move_stage result. */
export type MovedClient = {
  client: { id: string; name: string; stage_id: string; stage: string; lifecycle_stage: string };
  previous_stage_id: string;
  moved: boolean;
};
/** clients_create / clients_update result client. */
export type WrittenClient = { id: string; name: string; email?: string; phone?: string; company?: string };
export type CustomValue = string | number | boolean | null;
export type Page<T> = { items: T[]; nextCursor?: string };

const MAX_PAGES = 10; // 10 x 100 rows; raise if you need more

/** Follow `nextCursor` until exhausted (or MAX_PAGES). */
async function allPages<T>(tool: string, key: string, args: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const d = await readTool<Record<string, unknown>>(tool, { ...args, limit: 100, ...(cursor ? { cursor } : {}) });
    out.push(...((d[key] as T[] | undefined) ?? []));
    cursor = d.nextCursor as string | undefined;
    if (!cursor) break;
  }
  return out;
}

export const listClients = () => allPages<Client>("clients_search", "clients", {});
export async function getClient(id: string): Promise<Client | null> {
  const d = await readTool<{ client: Client | null }>("clients_get", { id });
  return d.client;
}
export const listProposals = (clientId?: string) =>
  allPages<Proposal>("proposals_search", "proposals", clientId ? { clientId } : {});
export const listInvoices = (clientId?: string) =>
  allPages<Invoice>("invoices_search", "invoices", clientId ? { clientId } : {});

type Section<T> = { available: boolean; reason?: string; items?: T[] };
type ClientsSchema = { type: string; stages?: Section<Stage>; custom_field_definitions?: Section<CustomFieldDef> };

async function readClientsSchema(): Promise<ClientsSchema | undefined> {
  const d = await readTool<{ record_types: ClientsSchema[] }>("workspace_schema", { record_types: ["clients"] });
  return d.record_types.find((r) => r.type === "clients");
}

/**
 * The workspace's configured client stages (workspace_schema > record_types[clients].stages),
 * ordered as in the app. Null when the caller lacks clients.view or the read failed.
 */
export async function getClientStages(): Promise<Stage[] | null> {
  const s = (await readClientsSchema())?.stages;
  return s?.available ? (s.items ?? []) : null;
}

/** Custom field definitions (workspace_schema > record_types[clients].custom_field_definitions), in app order. Null when unavailable. */
export async function getCustomFieldDefs(): Promise<CustomFieldDef[] | null> {
  const s = (await readClientsSchema())?.custom_field_definitions;
  return s?.available ? (s.items ?? []) : null;
}

export type Capabilities = {
  /** clients_move_stage is in tools/list. */
  moveStage: boolean;
  /** clients_create accepts `custom_fields`. */
  customFields: boolean;
  /** pipeline_summary is in tools/list (client list header). */
  pipelineSummary: boolean;
  /** follow_ups_list is in tools/list (next follow-up on the client page). */
  followUps: boolean;
  /** follow_ups_create is in tools/list. */
  followUpCreate: boolean;
  /** follow_ups_complete is in tools/list. */
  followUpComplete: boolean;
};

const NO_CAPABILITIES: Capabilities = { moveStage: false, customFields: false, pipelineSummary: false, followUps: false, followUpCreate: false, followUpComplete: false };

/** Pure: derive capabilities from a tools/list result. */
export function capabilitiesFromTools(tools: ToolInfo[]): Capabilities {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return {
    moveStage: byName.has("clients_move_stage"),
    customFields:
      !!byName.get("clients_update")?.inputSchema?.properties && "custom_fields" in (byName.get("clients_update")!.inputSchema!.properties!) &&
      !!byName.get("clients_create")?.inputSchema?.properties && "custom_fields" in (byName.get("clients_create")!.inputSchema!.properties!),
    pipelineSummary: byName.has("pipeline_summary"),
    followUps: byName.has("follow_ups_list"),
    followUpCreate: byName.has("follow_ups_create"),
    followUpComplete: byName.has("follow_ups_complete"),
  };
}

/** If tools/list itself fails, hide every optional feature rather than break the pages. */
export async function getCapabilities(): Promise<Capabilities> {
  try {
    return capabilitiesFromTools(await listTools());
  } catch {
    return NO_CAPABILITIES;
  }
}

/** Move a client to a stage (id or name). Write tool: may come back held for approval. */
export function moveClientStage(id: string, stage: string): Promise<CallResult<MovedClient>> {
  return callTool("clients_move_stage", { id, stage });
}

/** pipeline_summary: counts can be null when the server could not count them. */
export type PipelineSummary = {
  stages: { id: string; name: string; group: string; client_count: number | null }[];
  total_clients: number | null;
  new_clients: { last_7_days: number | null; last_30_days: number | null };
  stalled: { days: number; count: number | null; count_is_lower_bound?: boolean; clients: { id: string; name: string }[] };
};
/** One client's next follow-up (follow_ups_list). `source_ref.kind` is "reminder" for the ones follow_ups_complete can close. */
export type FollowUp = {
  client_id: string;
  client_name: string;
  group: "overdue" | "today" | "this_week" | "suggested";
  type: string;
  title: string;
  reason: string;
  due_at: string;
  channel?: string;
  source: string;
  source_ref?: { kind: string; id: string };
};

/** Header numbers for the client list. Null when the call fails or the caller may not read them: the header is simply hidden. */
export async function getPipelineSummary(): Promise<PipelineSummary | null> {
  try {
    const d = await readTool<PipelineSummary | undefined>("pipeline_summary", {});
    return d?.stages ? d : null;
  } catch {
    return null;
  }
}

/**
 * A client's next follow-up. follow_ups_list has no client filter and returns one item per client,
 * so read the first page (max 100) and pick this client's. Null when there is none (or the read failed).
 */
export async function getNextFollowUp(clientId: string): Promise<FollowUp | null> {
  try {
    const d = await readTool<{ items?: FollowUp[] }>("follow_ups_list", { limit: 100 });
    return d?.items?.find((i) => i.client_id === clientId) ?? null;
  } catch {
    return null;
  }
}

/** follow_ups_create. `due` is an ISO date (09:00 that day) or datetime. A repeat call with the same idempotency_key returns the first one. */
export function createFollowUp(
  input: { client_id: string; title: string; due: string; channel?: "email" | "sms" | "call" | "meeting"; note?: string },
  idempotencyKey?: string,
): Promise<CallResult<{ follow_up: { id: string; title: string; due_at: string }; deduped: boolean }>> {
  return callTool("follow_ups_create", { ...input, ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}) });
}

/** follow_ups_complete: closes a reminder. Pass the id from `source_ref.id`. */
export function completeFollowUp(clientId: string, followUpId?: string): Promise<CallResult<{ follow_up: { id: string; title: string }; completed: boolean }>> {
  return callTool("follow_ups_complete", { client_id: clientId, ...(followUpId ? { follow_up_id: followUpId } : {}) });
}

/** The form string for a stored custom field value ("" when there is none), so inputs open on the current value. */
export function customFieldFormValue(def: CustomFieldDef, value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return "";
  if (def.type === "boolean") return value === true ? "true" : value === false ? "false" : "";
  if (def.type === "date" && typeof value === "string") return value.slice(0, 10);
  return String(value);
}

/**
 * Turn raw form strings into typed custom field values, using the definitions. Blank means "leave alone",
 * so a stored value can't be cleared from this form. Returns an error message for a value the server
 * would refuse, so the user sees it before the call.
 */
export function coerceCustomFields(
  defs: CustomFieldDef[],
  raw: Record<string, string | undefined>,
): { ok: true; values: Record<string, CustomValue> } | { ok: false; error: string } {
  const values: Record<string, CustomValue> = {};
  for (const d of defs) {
    const v = raw[d.key]?.trim();
    if (v === undefined || v === "") continue;
    switch (d.type) {
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n)) return { ok: false, error: `${d.label || d.key} must be a number.` };
        values[d.key] = n;
        break;
      }
      case "boolean":
        if (v !== "true" && v !== "false") return { ok: false, error: `${d.label || d.key} must be yes or no.` };
        values[d.key] = v === "true";
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: `${d.label || d.key} must be a date (YYYY-MM-DD).` };
        values[d.key] = v;
        break;
      case "select":
        if (d.options.length > 0 && !d.options.includes(v)) return { ok: false, error: `${d.label || d.key}: pick one of ${d.options.join(", ")}.` };
        values[d.key] = v;
        break;
      default:
        values[d.key] = v.slice(0, 1000);
    }
  }
  return { ok: true, values };
}

/** clients_update. `custom_fields` keys are definition keys; the server refuses unknown keys. */
export function updateClientCustomFields(id: string, customFields: Record<string, CustomValue>): Promise<CallResult<{ client: WrittenClient }>> {
  return callTool("clients_update", { id, custom_fields: customFields });
}

/** clients_create. A repeat call with the same idempotency_key returns the first client (`deduped: true`). */
export function createClient(
  input: { name: string; email?: string; company?: string; lifecycle_stage?: "client" | "prospect"; custom_fields?: Record<string, CustomValue> },
  idempotencyKey?: string,
): Promise<CallResult<{ client: WrittenClient; deduped: boolean }>> {
  const { custom_fields, ...rest } = input;
  return callTool("clients_create", {
    ...rest,
    ...(custom_fields && Object.keys(custom_fields).length > 0 ? { custom_fields } : {}),
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  });
}

/**
 * Creates a DRAFT only (the tool never sends). Sending (proposals_send) is deliberately
 * never called from this app. A repeat call with the same idempotency_key returns the first proposal.
 */
export function draftProposal(clientId: string, title: string, idempotencyKey?: string): Promise<CallResult<{ proposal: DraftedProposal; deduped: boolean }>> {
  return callTool("proposals_create_draft", {
    client_id: clientId,
    title,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  });
}

export const formatDate = (ms?: number) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

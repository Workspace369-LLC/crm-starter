"use server";
import { revalidatePath } from "next/cache";
import { coerceCustomFields, createClient, draftProposal, getCustomFieldDefs, moveClientStage, updateClientCustomFields } from "@/lib/crm";

export type DraftState = { message: string; approvalUrl?: string; href?: string } | null;

const AWAITING = "Awaiting approval in Workspace369.";

async function customValues(form: FormData) {
  const defs = (await getCustomFieldDefs()) ?? [];
  const raw: Record<string, string> = {};
  for (const d of defs) raw[d.key] = String(form.get(`cf_${d.key}`) ?? "");
  return coerceCustomFields(defs, raw);
}

export async function moveStageAction(_prev: DraftState, form: FormData): Promise<DraftState> {
  const id = String(form.get("clientId") ?? "");
  const stage = String(form.get("stage") ?? "");
  if (!id || !stage) return { message: "Pick a stage." };
  try {
    const r = await moveClientStage(id, stage);
    revalidatePath("/");
    if (r.held) return { message: AWAITING, approvalUrl: r.approval.approval_url };
    return { message: r.data.moved ? `Moved to ${r.data.client.stage}.` : `Already in ${r.data.client.stage}.` };
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Failed to move client." };
  }
}

export async function updateCustomFieldsAction(_prev: DraftState, form: FormData): Promise<DraftState> {
  const id = String(form.get("clientId") ?? "");
  if (!id) return { message: "Missing client." };
  try {
    const c = await customValues(form);
    if (!c.ok) return { message: c.error };
    if (Object.keys(c.values).length === 0) return { message: "Nothing to save." };
    const r = await updateClientCustomFields(id, c.values);
    revalidatePath(`/clients/${id}`);
    if (r.held) return { message: AWAITING, approvalUrl: r.approval.approval_url };
    return { message: "Custom fields saved." };
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Failed to save." };
  }
}

export async function createClientAction(_prev: DraftState, form: FormData): Promise<DraftState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { message: "Name is required." };
  try {
    const c = await customValues(form);
    if (!c.ok) return { message: c.error };
    const r = await createClient(
      {
        name,
        email: String(form.get("email") ?? "").trim() || undefined,
        company: String(form.get("company") ?? "").trim() || undefined,
        lifecycle_stage: form.get("lifecycle_stage") === "prospect" ? "prospect" : "client",
        custom_fields: c.values,
      },
      String(form.get("key") ?? "") || undefined,
    );
    revalidatePath("/");
    if (r.held) return { message: AWAITING, approvalUrl: r.approval.approval_url };
    return { message: `Created ${r.data.client.name}.`, href: `/clients/${r.data.client.id}` };
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Failed to create client." };
  }
}

export async function draftProposalAction(_prev: DraftState, form: FormData): Promise<DraftState> {
  const clientId = String(form.get("clientId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  if (!clientId || !title) return { message: "Client and title are required." };
  try {
    const r = await draftProposal(clientId, title, String(form.get("key") ?? "") || undefined);
    revalidatePath(`/clients/${clientId}`);
    if (r.held) return { message: AWAITING, approvalUrl: r.approval.approval_url };
    return { message: "Draft created. Review and send it in the Workspace369 app." };
  } catch (e) {
    return { message: e instanceof Error ? e.message : "Failed to create draft." };
  }
}

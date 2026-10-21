import Link from "next/link";
import { getCapabilities, getClientStages, listClients, type Client, type Stage } from "@/lib/crm";
import { MoveStage } from "./clients/forms";

export const dynamic = "force-dynamic";

export default async function Pipeline() {
  const [clients, stages, caps] = await Promise.all([listClients(), getClientStages().catch(() => null), getCapabilities()]);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Pipeline</h1>
          <p className="sub">{clients.length} {clients.length === 1 ? "client" : "clients"}</p>
        </div>
        <Link href="/clients/new" className="btn btn-primary">New client</Link>
      </div>
      {clients.length === 0 && <p className="empty">No clients yet.</p>}
      {caps.moveStage && stages && stages.length > 0 ? <StageBoard clients={clients} stages={stages} /> : <GroupBoard clients={clients} stages={stages} />}
    </>
  );
}

function ClientInfo({ c }: { c: Client }) {
  const sub = c.company ?? c.email;
  return (
    <Link href={`/clients/${c.id}`}>
      <span className="name">{c.name}</span>
      {sub && <div className="meta">{sub}</div>}
      {(c.tags?.length ?? 0) > 0 && <div className="chips">{c.tags!.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
    </Link>
  );
}

/** One column per configured stage, with a move control on each card (clients_move_stage). */
function StageBoard({ clients, stages }: { clients: Client[]; stages: Stage[] }) {
  const known = new Set(stages.map((s) => s.id));
  const unstaged = clients.filter((c) => !c.stage_id || !known.has(c.stage_id));
  const cols = unstaged.length > 0 ? [...stages, { id: "", name: "No stage", group: "" }] : stages;
  return (
    <div className="board">
      {cols.map((s) => {
        const items = s.id === "" ? unstaged : clients.filter((c) => c.stage_id === s.id);
        return (
          <section key={s.id || "none"} className="col">
            <div className="colhead">
              <span className={`dot ${s.group}`} />
              <h2>{s.name}</h2>
              <span className="count">{items.length}</span>
            </div>
            {items.length === 0 && <p className="empty">No clients</p>}
            {items.map((c) => (
              <div key={c.id} className="card">
                <ClientInfo c={c} />
                <MoveStage clientId={c.id} stages={stages} current={c.stage_id && known.has(c.stage_id) ? c.stage_id : undefined} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** Fallback while clients_move_stage is not deployed: clients only expose lifecycle_stage (prospect | client). */
function GroupBoard({ clients, stages }: { clients: Client[]; stages: Stage[] | null }) {
  const groups = [{ id: "prospect", stageGroup: "lead" }, { id: "client", stageGroup: "client" }];
  return (
    <div className="board">
      {groups.map((g) => {
        const items = clients.filter((c) => (c.lifecycle_stage ?? "client") === g.id);
        return (
          <section key={g.id} className="col">
            <div className="colhead">
              <span className={`dot ${g.stageGroup}`} />
              <h2 style={{ textTransform: "capitalize" }}>{g.id}</h2>
              <span className="count">{items.length}</span>
            </div>
            {stages && <p className="empty">{stages.filter((s) => s.group === g.stageGroup).map((s) => s.name).join(" · ")}</p>}
            {items.map((c) => <div key={c.id} className="card"><ClientInfo c={c} /></div>)}
          </section>
        );
      })}
    </div>
  );
}

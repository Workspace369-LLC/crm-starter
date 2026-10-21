import "server-only";

/**
 * Server-only Workspace369 client. Calls the MCP endpoint over HTTPS with
 * JSON-RPC `tools/call`. Never import this from a client component: the token
 * must stay on the server.
 */

const DEFAULT_URL = "https://mcp.workspace369.com/mcp";

export class W369Error extends Error {
  constructor(message: string, readonly kind: "http" | "rpc" | "tool" | "config", readonly status?: number) {
    super(message);
    this.name = "W369Error";
  }
}

export type HeldForApproval = {
  held_for_approval: true;
  approval_id: string;
  approval_url?: string;
  approval_expires_at?: string;
};

export type CallResult<T> = { held: false; data: T } | { held: true; approval: HeldForApproval };

type RpcEnvelope = {
  result?: { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
  error?: { code: number; message: string };
};

/** Parse a response body that is either plain JSON or an SSE stream of `data:` events. */
export function parseRpcBody(text: string, contentType: string): RpcEnvelope {
  if (contentType.includes("text/event-stream")) {
    let last: RpcEnvelope | undefined;
    for (const block of text.split(/\r?\n\r?\n/)) {
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data) continue;
      const msg = JSON.parse(data) as RpcEnvelope;
      if (msg.result || msg.error) last = msg;
    }
    if (!last) throw new W369Error("SSE reply contained no JSON-RPC message", "rpc");
    return last;
  }
  return JSON.parse(text) as RpcEnvelope;
}

export async function callTool<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
  opts: { token?: string; url?: string; fetchImpl?: typeof fetch } = {},
): Promise<CallResult<T>> {
  const token = opts.token ?? process.env.W369_TOKEN;
  if (!token) throw new W369Error("W369_TOKEN is not set", "config");
  const doFetch = opts.fetchImpl ?? fetch;
  const url = opts.url ?? process.env.W369_MCP_URL ?? DEFAULT_URL;

  const res = await doFetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });

  const text = await res.text();
  if (!res.ok) throw new W369Error(`Workspace369 HTTP ${res.status}: ${text.slice(0, 300)}`, "http", res.status);

  const env = parseRpcBody(text, res.headers.get("content-type") ?? "");
  if (env.error) throw new W369Error(`Workspace369 RPC error ${env.error.code}: ${env.error.message}`, "rpc");
  const result = env.result;
  if (!result) throw new W369Error("Workspace369 reply had no result", "rpc");

  if (result.isError) {
    const msg = result.content?.find((c) => c.type === "text")?.text ?? "Tool call failed";
    throw new W369Error(msg, "tool");
  }

  const data = result.structuredContent as (T & Partial<HeldForApproval>) | undefined;
  if (data && (data as Partial<HeldForApproval>).held_for_approval === true) {
    return { held: true, approval: data as HeldForApproval };
  }
  return { held: false, data: data as T };
}

/** Convenience for read tools that can never be held. */
export async function readTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await callTool<T>(name, args);
  if (r.held) throw new W369Error(`${name} was held for approval unexpectedly`, "tool");
  return r.data;
}

export type ToolInfo = { name: string; inputSchema?: { properties?: Record<string, unknown> } };

/**
 * `tools/list`: what this workspace's server actually offers right now. Used to hide features whose
 * tool is not deployed yet. Throws W369Error on transport/RPC failure; callers decide how to degrade.
 */
export async function listTools(opts: { token?: string; url?: string; fetchImpl?: typeof fetch } = {}): Promise<ToolInfo[]> {
  const token = opts.token ?? process.env.W369_TOKEN;
  if (!token) throw new W369Error("W369_TOKEN is not set", "config");
  const doFetch = opts.fetchImpl ?? fetch;
  const url = opts.url ?? process.env.W369_MCP_URL ?? DEFAULT_URL;
  const res = await doFetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const text = await res.text();
  if (!res.ok) throw new W369Error(`Workspace369 HTTP ${res.status}: ${text.slice(0, 300)}`, "http", res.status);
  const env = parseRpcBody(text, res.headers.get("content-type") ?? "") as RpcEnvelope & { result?: { tools?: ToolInfo[] } };
  if (env.error) throw new W369Error(`Workspace369 RPC error ${env.error.code}: ${env.error.message}`, "rpc");
  return env.result?.tools ?? [];
}

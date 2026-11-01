export const DEFAULT_URL: string;
export const MAX_STAGES: number;
export const MAX_FIELDS: number;
export const TOOL: string;
export type ToolResult = { isError: boolean; text: string; data?: any };
export type SetupClient = {
  listTools(): Promise<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }[]>;
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
};
export function readConfig(env?: Record<string, string | undefined>): { token: string; url: string };
export function createClient(opts: { token: string; url: string; fetchImpl?: typeof fetch }): SetupClient;
export function validateBlueprint(bp: unknown): string[];
export function blueprintArgs(bp: any): Record<string, unknown>;
export function formatPreview(data: any, text?: string): string;
export function runSetup(opts: { client: SetupClient; blueprint: any; ask: (q: string) => Promise<string>; log?: (line: string) => void }): Promise<number>;

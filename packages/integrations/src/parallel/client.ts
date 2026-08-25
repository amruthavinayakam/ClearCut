import {
  EvidenceSourceSchema,
  MonitorRecordSchema,
  type ClearanceItem,
  type EvidenceSource,
  type MonitorRecord,
} from "@clearcut/contracts";

import {
  DossierSchema,
  type Dossier,
  type ParallelClient,
  type RequestFunction,
  validateOutput,
} from "../types";
import { isVerifiedSample } from "../sample";

type VerifiedSource = {
  url: string;
  title: string;
  excerpt: string;
  publish_date: string | null;
};

type VerifiedCase = Omit<Dossier, "run_id" | "basis"> & {
  source_keys: string[];
};

type VerifiedResearchCatalog = {
  sources: Record<string, VerifiedSource>;
  cases: Record<string, VerifiedCase>;
};

async function verifiedResearch(): Promise<VerifiedResearchCatalog> {
  return Bun.file(new URL("../../../../fixtures/research/artemis/research.json", import.meta.url)).json();
}

async function verifiedCase(item: ClearanceItem) {
  const catalog = await verifiedResearch();
  const dossier = catalog.cases[item.name];
  if (!dossier) throw new Error(`Verified sample research is missing for ${item.name}.`);
  const sources = dossier.source_keys.map((key) => catalog.sources[key]).filter((source): source is VerifiedSource => Boolean(source));
  return { dossier, sources };
}

function queries(item: ClearanceItem): string[] {
  const suffix: Record<string, string[]> = {
    music: ["song publisher synchronization licensing", "master recording owner licensing"],
    artwork: ["artwork copyright owner licensing", "artist estate reproduction permissions"],
    brand: ["trademark owner film permissions", "brand licensing contact"],
    real_person: ["estate likeness rights representative", "publicity rights licensing"],
    location: ["filming permit contact", "property owner filming permission"],
  };
  return (suffix[item.category] ?? ["rights holder licensing", "film permission contact"])
    .map((ending) => `${item.name} ${ending}`);
}

function monitorQuery(item: ClearanceItem): string {
  return `Public ownership, licensing-policy, representation, registry, or litigation changes affecting how a film production requests permission to use ${item.name}.`;
}

function dossierInput(item: ClearanceItem, productionTitle: string, sources: EvidenceSource[]): string {
  return `Rights-clearance research for the production "${productionTitle}".\nElement: ${item.name}\nCategory: ${item.category}\nDescription: ${item.description}\nProvenance: ${item.provenance}\nPreviously retrieved sources: ${sources.map((source) => source.url).join(", ") || "none"}.\nEstablish candidate rights holders and official contact routes. Treat unknowns as evidence gaps. Do not make a legal conclusion.`;
}

function withTaskCitations(dossier: Dossier, rawBasis: unknown): Dossier {
  const basis = Array.isArray(rawBasis) ? rawBasis.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      field: String(row.field ?? ""),
      reasoning: String(row.reasoning ?? ""),
      confidence: row.confidence == null ? null : String(row.confidence),
      citations: Array.isArray(row.citations) ? row.citations.flatMap((citation) => {
        const value = citation as Record<string, unknown>;
        return typeof value.url === "string" ? [{
          url: value.url,
          title: typeof value.title === "string" ? value.title : null,
          excerpts: Array.isArray(value.excerpts) ? value.excerpts.map(String) : [],
        }] : [];
      }) : [],
    };
  }) : [];
  return DossierSchema.parse({ ...dossier, basis });
}

export class FixtureParallelClient implements ParallelClient {
  readonly calls: Array<{ operation: "search" | "dossier"; itemId: string }> = [];

  async searchClearanceItem(item: ClearanceItem, _productionTitle: string, _sessionId: string) {
    this.calls.push({ operation: "search", itemId: item.id });
    if (isVerifiedSample(_productionTitle)) {
      const { sources } = await verifiedCase(item);
      return sources.map((source) => EvidenceSourceSchema.parse({
        ...source,
        retrieved_at: new Date().toISOString(),
        via: "parallel_search",
        field: null,
      }));
    }
    const fixture = await Bun.file(new URL("../../../../fixtures/research/search.json", import.meta.url)).json() as {
      source: Record<string, unknown>;
    };
    return [EvidenceSourceSchema.parse({
      ...fixture.source,
      url: `${fixture.source.url}/${encodeURIComponent(item.id)}`,
      retrieved_at: new Date().toISOString(),
      via: "parallel_search",
      field: null,
    })];
  }

  async buildDossier(item: ClearanceItem, _productionTitle: string, _sources: EvidenceSource[]) {
    this.calls.push({ operation: "dossier", itemId: item.id });
    if (isVerifiedSample(_productionTitle)) {
      const { dossier, sources } = await verifiedCase(item);
      const { source_keys: _sourceKeys, ...fields } = dossier;
      return DossierSchema.parse({
        ...fields,
        run_id: `verified-sample-task-${item.stable_item_id}`,
        basis: sources.map((source) => ({
          field: "public research",
          reasoning: "Official source reviewed for the recorded candidate, route, and remaining evidence gap.",
          confidence: dossier.overall_confidence,
          citations: [{ url: source.url, title: source.title, excerpts: [source.excerpt] }],
        })),
      });
    }
    const fixture = await Bun.file(new URL("../../../../fixtures/research/dossier.json", import.meta.url)).json();
    return DossierSchema.parse({ ...fixture, run_id: `mock-task-${item.id}`, basis: [] });
  }

  async createMonitor(item: ClearanceItem, _productionTitle: string, projectId: string, frequency: string) {
    const verified = isVerifiedSample(_productionTitle);
    return MonitorRecordSchema.parse({
      monitor_id: verified ? `verified-sample-monitor-${item.id}` : `mock-monitor-${item.id}`,
      project_id: projectId,
      item_id: item.id,
      item_name: item.name,
      query: verified ? monitorQuery(item) : `MOCK: ${monitorQuery(item)}`,
      frequency,
      created_at: new Date().toISOString(),
      status: "active",
      events: [],
    });
  }

  async readMonitorEvents(monitorId: string) {
    const fixture = await Bun.file(new URL("../../../../fixtures/research/monitor.json", import.meta.url)).json() as {
      event: MonitorRecord["events"][number];
    };
    if (monitorId.startsWith("verified-sample-monitor-")) {
      const sample = await Bun.file(new URL("../../../../fixtures/research/artemis/monitor.json", import.meta.url)).json() as {
        event: MonitorRecord["events"][number];
      };
      return [sample.event];
    }
    return [{ ...fixture.event, event_id: `${monitorId}-event-1` }];
  }
}

export class LiveParallelClient implements ParallelClient {
  readonly #request: RequestFunction;
  readonly #processor: string;
  readonly #monitorProcessor: string;
  readonly #publicBaseUrl: string;

  constructor(options: {
    apiKey: string;
    processor?: string;
    monitorProcessor?: string;
    publicBaseUrl?: string;
    request?: RequestFunction;
  }) {
    if (!options.apiKey.trim()) throw new Error("PARALLEL_API_KEY is required for live Parallel mode.");
    this.#processor = options.processor ?? "core";
    this.#monitorProcessor = options.monitorProcessor ?? "lite";
    this.#publicBaseUrl = options.publicBaseUrl ?? "";
    this.#request = options.request ?? (async (operation, input) => {
      const endpoints: Record<string, [string, string]> = {
        search: ["POST", "/v1/search"],
        task_create: ["POST", "/v1/tasks/runs"],
        monitor_create: ["POST", "/v1/monitors"],
      };
      let method = "GET";
      let path = "";
      if (operation.startsWith("task_result:")) path = `/v1/tasks/runs/${operation.slice(12)}/result`;
      else if (operation.startsWith("monitor_events:")) path = `/v1/monitors/${operation.slice(15)}/events`;
      else [method, path] = endpoints[operation] ?? ["GET", ""];
      if (!path) throw new Error(`Unsupported Parallel operation: ${operation}`);
      const response = await fetch(`https://api.parallel.ai${path}`, {
        method,
        headers: { "content-type": "application/json", "x-api-key": options.apiKey },
        body: method === "POST" ? JSON.stringify(input) : undefined,
      });
      if (!response.ok) throw new Error(`Parallel ${operation} failed (${response.status}): ${await response.text()}`);
      return response.json();
    });
  }

  async searchClearanceItem(item: ClearanceItem, productionTitle: string, sessionId: string) {
    const raw = await this.#request("search", {
      search_queries: queries(item),
      objective: `Identify who currently controls rights to ${item.name} (${item.category}) and the official permission route for the film production ${productionTitle}. Prefer primary sources and do not infer ownership.`,
      max_chars_total: 12_000,
      session_id: sessionId,
    }) as { results?: unknown[] };
    return (raw.results ?? []).flatMap((entry) => {
      const row = entry as Record<string, unknown>;
      if (typeof row.url !== "string") return [];
      return [EvidenceSourceSchema.parse({
        url: row.url,
        title: typeof row.title === "string" ? row.title : null,
        excerpt: Array.isArray(row.excerpts) ? String(row.excerpts[0] ?? "").slice(0, 1_200) : "",
        publish_date: typeof row.publish_date === "string" ? row.publish_date : null,
        retrieved_at: new Date().toISOString(),
        via: "parallel_search",
        field: null,
      })];
    });
  }

  async buildDossier(item: ClearanceItem, productionTitle: string, sources: EvidenceSource[]) {
    const created = await this.#request("task_create", {
      input: dossierInput(item, productionTitle, sources),
      processor: this.#processor,
      task_spec: { output_schema: { type: "json", json_schema: DossierSchema.omit({ run_id: true, basis: true }).toJSONSchema() } },
      metadata: { item_id: item.id, category: item.category, project: "clearcut" },
    }) as { run_id?: string };
    if (!created.run_id) throw new Error("Parallel Task did not return a run_id.");
    const result = await this.#request(`task_result:${created.run_id}`, {}) as {
      output?: { content?: unknown; basis?: unknown };
    };
    const content = typeof result.output?.content === "string"
      ? JSON.parse(result.output.content)
      : result.output?.content;
    const dossier = validateOutput("Parallel Task", DossierSchema, {
      ...(content as object),
      run_id: created.run_id,
      basis: [],
    });
    return withTaskCitations(dossier, result.output?.basis);
  }

  async createMonitor(item: ClearanceItem, _productionTitle: string, projectId: string, frequency: string) {
    const webhook = this.#publicBaseUrl ? {
      url: `${this.#publicBaseUrl.replace(/\/$/, "")}/api/webhooks/parallel`,
      event_types: ["monitor.event.detected"],
    } : undefined;
    const raw = await this.#request("monitor_create", {
      type: "event_stream",
      frequency,
      processor: this.#monitorProcessor,
      settings: { query: monitorQuery(item), include_backfill: true },
      metadata: { project_id: projectId, item_id: item.id, external_id: `clearcut-${item.id}` },
      ...(webhook ? { webhook } : {}),
    }) as Record<string, unknown>;
    return MonitorRecordSchema.parse({
      monitor_id: raw.monitor_id,
      project_id: projectId,
      item_id: item.id,
      item_name: item.name,
      query: monitorQuery(item),
      frequency,
      created_at: raw.created_at,
      status: raw.status ?? "active",
      events: [],
    });
  }

  async readMonitorEvents(monitorId: string) {
    const raw = await this.#request(`monitor_events:${monitorId}`, {}) as { events?: unknown[] };
    return (raw.events ?? []).map((entry) => {
      const row = entry as Record<string, unknown>;
      const output = (row.output ?? {}) as Record<string, unknown>;
      return {
        event_id: typeof row.event_id === "string" ? row.event_id : null,
        event_date: typeof row.event_date === "string" ? row.event_date : null,
        content: typeof output.content === "string" ? output.content : null,
        basis: output.basis,
      };
    });
  }
}

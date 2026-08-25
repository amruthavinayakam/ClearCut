import { MonitorRecordSchema, type MonitorRecord } from "@clearcut/contracts";

import type { MonitorRepository } from "./monitor-repository";

export class MemoryMonitorRepository implements MonitorRepository {
  readonly #records = new Map<string, MonitorRecord>();
  readonly #deliveries = new Set<string>();

  async get(monitorId: string): Promise<MonitorRecord | null> {
    const record = this.#records.get(monitorId);
    return record ? structuredClone(record) : null;
  }

  async save(record: MonitorRecord): Promise<MonitorRecord> {
    const validated = MonitorRecordSchema.parse(record);
    this.#records.set(validated.monitor_id, structuredClone(validated));
    return structuredClone(validated);
  }

  async listForProject(projectId: string): Promise<MonitorRecord[]> {
    return [...this.#records.values()]
      .filter((record) => record.project_id === projectId)
      .map((record) => structuredClone(record));
  }

  async hasDelivery(deliveryId: string): Promise<boolean> {
    return this.#deliveries.has(deliveryId);
  }

  async recordDelivery(deliveryId: string): Promise<void> {
    this.#deliveries.add(deliveryId);
  }
}

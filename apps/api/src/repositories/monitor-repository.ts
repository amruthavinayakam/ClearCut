import type { MonitorRecord } from "@clearcut/contracts";

export interface MonitorRepository {
  get(monitorId: string): Promise<MonitorRecord | null>;
  save(record: MonitorRecord): Promise<MonitorRecord>;
  listForProject(projectId: string): Promise<MonitorRecord[]>;
  hasDelivery(deliveryId: string): Promise<boolean>;
  recordDelivery(deliveryId: string): Promise<void>;
}

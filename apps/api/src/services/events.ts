import {
  ProjectStreamEnvelopeSchema,
  type ProjectStreamEnvelope,
  type ProjectStreamEvent,
} from "@clearcut/contracts";

type Waiting = (result: IteratorResult<ProjectStreamEnvelope>) => void;

export class ProjectEventSubscription implements AsyncIterableIterator<ProjectStreamEnvelope> {
  readonly #queue: ProjectStreamEnvelope[] = [];
  readonly #waiting: Waiting[] = [];
  #closed = false;
  readonly #onClose: () => void;

  constructor(onClose: () => void) {
    this.#onClose = onClose;
  }

  [Symbol.asyncIterator]() { return this; }

  next(): Promise<IteratorResult<ProjectStreamEnvelope>> {
    const queued = this.#queue.shift();
    if (queued) return Promise.resolve({ done: false, value: queued });
    if (this.#closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  push(event: ProjectStreamEnvelope) {
    if (this.#closed) return;
    const waiting = this.#waiting.shift();
    if (waiting) waiting({ done: false, value: event });
    else this.#queue.push(event);
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#onClose();
    for (const resolve of this.#waiting.splice(0)) resolve({ done: true, value: undefined });
  }
}

export class ProjectEventBus {
  readonly #history = new Map<string, ProjectStreamEnvelope[]>();
  readonly #subscribers = new Map<string, Set<ProjectEventSubscription>>();
  #nextId = 1;

  constructor(readonly historyLimit = 1_000) {}

  publish(projectId: string, event: ProjectStreamEvent): ProjectStreamEnvelope {
    const envelope = ProjectStreamEnvelopeSchema.parse({ id: this.#nextId++, event });
    const history = this.#history.get(projectId) ?? [];
    history.push(envelope);
    if (history.length > this.historyLimit) history.splice(0, history.length - this.historyLimit);
    this.#history.set(projectId, history);
    for (const subscriber of this.#subscribers.get(projectId) ?? []) subscriber.push(envelope);
    return envelope;
  }

  snapshotSince(projectId: string, afterId = 0): ProjectStreamEnvelope[] {
    return (this.#history.get(projectId) ?? []).filter((envelope) => envelope.id > afterId);
  }

  subscribe(projectId: string): ProjectEventSubscription {
    const subscribers = this.#subscribers.get(projectId) ?? new Set<ProjectEventSubscription>();
    let subscription: ProjectEventSubscription;
    subscription = new ProjectEventSubscription(() => {
      subscribers.delete(subscription);
      if (subscribers.size === 0) this.#subscribers.delete(projectId);
    });
    subscribers.add(subscription);
    this.#subscribers.set(projectId, subscribers);
    return subscription;
  }
}

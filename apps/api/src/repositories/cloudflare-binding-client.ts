export type BindingClientOptions = {
  origin?: string;
  nonce: string;
  fetcher?: (request: Request) => Promise<Response>;
};

export class CloudflareBindingError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CloudflareBindingError";
  }
}

export class CloudflareBindingClient {
  readonly #origin: string;
  readonly #nonce: string;
  readonly #fetcher: (request: Request) => Promise<Response>;

  constructor(options: BindingClientOptions) {
    if (!options.nonce) throw new Error("CLOUDFLARE_BINDING_NONCE is required.");
    this.#origin = (options.origin ?? "http://bindings.internal").replace(/\/$/, "");
    this.#nonce = options.nonce;
    this.#fetcher = options.fetcher ?? ((request) => fetch(request));
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("x-clearcut-binding-nonce", this.#nonce);
    const response = await this.#fetcher(new Request(`${this.#origin}${path}`, { ...init, headers }));
    if (!response.ok) {
      let body: { code?: string; message?: string } = {};
      try { body = await response.clone().json() as typeof body; } catch { /* non-JSON bridge error */ }
      throw new CloudflareBindingError(
        response.status,
        body.code ?? "binding_request_failed",
        body.message ?? `Cloudflare binding request failed (${response.status}).`,
      );
    }
    return response;
  }

  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    return response.json() as Promise<T>;
  }
}

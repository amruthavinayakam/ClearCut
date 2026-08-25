import { AwsClient } from "aws4fetch";

import type { UploadSigner } from "./uploads";

function xmlEscape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export class R2Presigner implements UploadSigner {
  readonly #client: AwsClient;
  readonly #baseUrl: string;

  constructor(input: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }) {
    this.#client = new AwsClient({
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
      service: "s3",
      region: "auto",
    });
    this.#baseUrl = `https://${input.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(input.bucket)}`;
  }

  #url(key: string, query = "") {
    return `${this.#baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}${query}`;
  }

  async signPut(key: string, options: { contentType: string; expiresInSeconds: number }) {
    const url = new URL(this.#url(key));
    url.searchParams.set("X-Amz-Expires", String(options.expiresInSeconds));
    const request = await this.#client.sign(new Request(url, {
      method: "PUT",
      headers: { "content-type": options.contentType },
    }), { aws: { signQuery: true } });
    return request.url;
  }

  async createMultipart(key: string, options: { contentType: string; partCount: number; expiresInSeconds: number }) {
    const initiate = await this.#client.fetch(this.#url(key, "?uploads"), {
      method: "POST",
      headers: { "content-type": options.contentType },
    });
    if (!initiate.ok) throw new Error(`R2 multipart initiation failed (${initiate.status}).`);
    const xml = await initiate.text();
    const uploadId = xml.match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
    if (!uploadId) throw new Error("R2 multipart initiation returned no upload id.");
    const parts = await Promise.all(Array.from({ length: options.partCount }, async (_, index) => {
      const partNumber = index + 1;
      const url = new URL(this.#url(key, `?partNumber=${partNumber}&uploadId=${encodeURIComponent(uploadId)}`));
      url.searchParams.set("X-Amz-Expires", String(options.expiresInSeconds));
      const request = await this.#client.sign(new Request(url, { method: "PUT" }), {
        aws: { signQuery: true },
      });
      return { part_number: partNumber, upload_url: request.url };
    }));
    return { uploadId, parts };
  }

  async completeMultipart(key: string, uploadId: string, parts: Array<{ part_number: number; etag: string }>) {
    const body = `<CompleteMultipartUpload>${parts
      .sort((left, right) => left.part_number - right.part_number)
      .map((part) => `<Part><PartNumber>${part.part_number}</PartNumber><ETag>${xmlEscape(part.etag)}</ETag></Part>`)
      .join("")}</CompleteMultipartUpload>`;
    const response = await this.#client.fetch(this.#url(key, `?uploadId=${encodeURIComponent(uploadId)}`), {
      method: "POST",
      headers: { "content-type": "application/xml" },
      body,
    });
    if (!response.ok) throw new Error(`R2 multipart completion failed (${response.status}).`);
  }
}

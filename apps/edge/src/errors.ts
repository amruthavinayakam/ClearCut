export class EdgeProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EdgeProblem";
  }
}

export function problemResponse(error: unknown): Response {
  if (error instanceof EdgeProblem) {
    return Response.json({ code: error.code, message: error.message }, { status: error.status });
  }
  return Response.json({ code: "edge_internal_error", message: "The edge request could not be completed." }, { status: 500 });
}

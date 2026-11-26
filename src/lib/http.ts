/** Erro com status HTTP e código estável para a interface traduzir. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** JSON com bigint serializado como string (valores monetários nunca viram number). */
export function json(data: unknown, status = 200): Response {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new Response(body, { status, headers: { "content-type": "application/json" } });
}

/** Executa o handler e converte HttpError (ou erro inesperado) em resposta JSON. */
export async function respond(handler: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await handler());
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.code }, err.status);
    console.error(err);
    return json({ error: "erro_interno" }, 500);
  }
}

/** Violação de UNIQUE no Postgres (o drizzle embrulha o erro do driver em `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function fetchBFF<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new APIError(
      res.status,
      body.error || body.message || `HTTP ${res.status}`,
    );
  }
  const data = await res.json();
  return schema.parse(data); // Runtime Zod validation
}

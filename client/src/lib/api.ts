export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...(options?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "A background-agent request failed.", response.status);
  return body;
}

export function requestJson<T = unknown>(method: "POST" | "PUT" | "PATCH", path: string, payload: unknown) {
  return apiFetch<T>(path, { method, body: JSON.stringify(payload) });
}

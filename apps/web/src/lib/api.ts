/** Thin fetch wrapper. The Next.js server proxies /api/* to the NestJS API, so cookies stay first-party. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: any,
  ) {
    super(message);
  }
  /** Machine-readable code for typed backend errors (e.g. AI_RATE_LIMITED). */
  get code(): string | undefined {
    return typeof this.body?.error === 'string' && /^[A-Z_]+$/.test(this.body.error) ? this.body.error : undefined;
  }
  get reasons(): string[] | undefined {
    return Array.isArray(this.body?.reasons) ? this.body.reasons : undefined;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join('. ') : (m ?? res.statusText), data);
  }
  return data as T;
}

/** Multipart upload (browser sets the boundary header itself, so no Content-Type here). */
async function upload<T>(url: string, field: string, file: File): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  const res = await fetch(`/api${url}`, { method: 'POST', credentials: 'include', body: form, cache: 'no-store' });
  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = { message: res.status === 413 ? 'The file is too large for the server.' : text };
  }
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join('. ') : (m ?? res.statusText), data);
  }
  return data as T;
}

export const api = {
  upload,
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  delete: <T>(url: string) => request<T>('DELETE', url),
};

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const errMessage = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong');

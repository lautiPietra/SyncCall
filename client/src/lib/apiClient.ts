const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, method = 'GET', ...rest } = options;
  const isFormData = body instanceof FormData;

  const finalHeaders = new Headers(headers);
  if (!isFormData && body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  if (MUTATING_METHODS.has(method.toUpperCase())) {
    finalHeaders.set('X-Requested-With', 'XMLHttpRequest');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    method,
    headers: finalHeaders,
    credentials: 'include',
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'Error de red';
    throw new ApiClientError(response.status, message);
  }

  return data as T;
}

let refreshPromise: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshPromise ??= rawRequest<void>('/auth/refresh', { method: 'POST' }).finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** Wrapper de fetch: cookies de sesión, header anti-CSRF en mutaciones, y un
 * reintento automático vía /auth/refresh si el access token ya venció. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    const isAuthEndpoint = path.startsWith('/auth/');
    if (err instanceof ApiClientError && err.status === 401 && !isAuthEndpoint) {
      await refreshSession();
      return rawRequest<T>(path, options);
    }
    throw err;
  }
}

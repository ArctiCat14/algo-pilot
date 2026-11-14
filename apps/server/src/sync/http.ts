const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

export interface FetchOptions {
  attempts?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  label?: string;
  signal?: AbortSignal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) return `${error.message}: ${cause.message}`;
    return error.message;
  }
  return String(error);
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  options: FetchOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 45_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const signal = options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, {
        ...init,
        headers: { ...DEFAULT_HEADERS, ...options.headers, ...(init.headers ?? {}) },
        signal,
        redirect: init.redirect ?? 'follow',
      });

      if (response.status === 429 || response.status >= 500) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `HTTP ${response.status}${body ? ` · ${body.replace(/\s+/g, ' ').slice(0, 180)}` : ''}`,
        );
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `HTTP ${response.status}${body ? ` · ${body.replace(/\s+/g, ' ').slice(0, 240)}` : ''}`,
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const wait = Math.min(12_000, 700 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 350);
      console.warn(
        `[sync] ${options.label ?? url} 第 ${attempt}/${attempts} 次请求失败：${describeError(error)}，${wait}ms 后重试`,
      );
      await sleep(wait);
    }
  }

  throw new Error(`${options.label ?? url} 请求失败：${describeError(lastError)}`);
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, { headers: { Accept: 'application/json' } }, options);
  return (await response.json()) as T;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await fetchWithRetry(url, { headers: { Accept: 'text/html,application/xhtml+xml' } }, options);
  return response.text();
}

export { sleep, describeError };

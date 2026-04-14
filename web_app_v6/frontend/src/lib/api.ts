export const DEFAULT_USER_ID = 'default_user';

// Use same-origin BFF by default to avoid hard-depending on a separate backend process in dev.
// You can override with NEXT_PUBLIC_API_URL (e.g. '/api' or 'https://example.com/api').
// Use BFF Route Handler to support streaming and avoid CORS issues in production/tunnels.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/bff').replace(/\/$/, '');
const BACKEND_DIRECT = (process.env.NEXT_PUBLIC_BACKEND_URL || '/bff').replace(/\/$/, '');

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

export function buildStreamUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_DIRECT}${normalizedPath}`;
}

export async function fetchWithRetry(url: string, timeoutMs = 15000, maxRetries = 100) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      // Exponential backoff with jitter
      const delay = Math.min(1000 * Math.pow(1.5, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      clearTimeout(timer);
    }
  }
}

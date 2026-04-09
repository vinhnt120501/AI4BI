export const DEFAULT_USER_ID = 'default_user';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
const DIRECT_BACKEND_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8333').replace(/\/$/, '');

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    API_BASE.startsWith('/')
  ) {
    return `${DIRECT_BACKEND_BASE}${normalizedPath}`;
  }

  return `${API_BASE}${normalizedPath}`;
}


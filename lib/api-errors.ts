import { NextResponse } from 'next/server';

// Consistency Conventions: API errors are `{ "error": { "code", "message" } }`.
// Successful responses return the resource directly, no envelope.

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const Errors = {
  unauthorized: () => apiError(401, 'UNAUTHORIZED', 'Authentication required'),
  forbidden: (message = 'You do not have access to this resource') =>
    apiError(403, 'FORBIDDEN', message),
  invalidCredentials: () => apiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password'),
  validation: (message: string) => apiError(400, 'VALIDATION_ERROR', message),
  notFound: (message = 'Not found') => apiError(404, 'NOT_FOUND', message),
  conflict: (message: string) => apiError(409, 'CONFLICT', message),
  gone: (message: string) => apiError(410, 'GONE', message),
  internal: () => apiError(500, 'INTERNAL_ERROR', 'Something went wrong'),
};

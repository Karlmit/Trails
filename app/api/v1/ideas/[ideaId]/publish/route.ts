import type { NextRequest } from 'next/server';
import { publishIdea } from '@/lib/publish-idea';

export function POST(request: NextRequest, context: { params: Promise<{ ideaId: string }> }) {
  return publishIdea(request, context, true);
}

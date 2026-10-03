import { workspaceOwner } from '@/lib/household';
import type { z } from 'zod';
import { readOwnerRows } from '@/lib/server-records';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { tagSchemas, type Tag, type TagLink } from '@/lib/tags';

const unavailable = () => Response.json({ error: 'Could not load tags. Check that the latest migrations are installed.' }, { status: 503 });

export async function GET() {
 try {
  const auth = await session(); if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const [tags, links] = await Promise.all([readOwnerRows<Tag>('transaction_tags', auth.token, { select: 'id,name,color', order: 'created_at.asc,id.asc' }), readOwnerRows<TagLink>('transaction_tag_links', auth.token, { select: 'record_id,tag_id', order: 'record_id.asc,tag_id.asc' })]);
  return Response.json({ tags, links }, { headers: { 'Cache-Control': 'no-store' } });
 } catch { return unavailable(); }
}

export async function POST(req: Request) {
 if (!sameOrigin(req)) return new Response(null, { status: 403 });
 try {
  const auth = await session(); if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const body = await req.json() as { action?: string; data?: unknown };
  if (!body.action || !Object.hasOwn(tagSchemas, body.action)) return Response.json({ error: 'Check the tag fields.' }, { status: 400 });
  const parsed = tagSchemas[body.action as keyof typeof tagSchemas].safeParse(body.data);
  if (!parsed.success) return Response.json({ error: 'Check the tag fields.' }, { status: 400 });
  if (body.action === 'delete') {
   const response = await supa('/rest/v1/transaction_tags?id=eq.' + parsed.data.id, { method: 'DELETE' }, auth.token);
   return response.ok ? Response.json({ ok: true }) : unavailable();
  }
  const tag = parsed.data as z.infer<typeof tagSchemas.save>;
  const response = await supa('/rest/v1/transaction_tags?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ id: tag.id, user_id: workspaceOwner(auth), name: tag.name, color: tag.color }) }, auth.token);
  if (response.ok) return Response.json({ ok: true });
  const detail = await response.json().catch(() => ({})) as { code?: string };
  return detail.code === '23505' ? Response.json({ error: 'A tag with this name already exists.' }, { status: 409 }) : unavailable();
 } catch { return unavailable(); }
}

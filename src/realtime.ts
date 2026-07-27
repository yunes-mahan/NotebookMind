/**
 * Thin wrapper around Supabase Realtime (postgres_changes) so screens can react
 * to live DB changes without a reload — a student joining, a comment posted, a
 * friend request. Realtime respects RLS, so a subscriber only receives rows it
 * may SELECT.
 *
 * There is no per-screen unmount hook in the shell, so every subscription is
 * tracked here and torn down by clearRealtime(), which the app calls on each
 * navigation. That guarantees a screen's channels never leak into the next one.
 */
import { getClient } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const active: RealtimeChannel[] = [];

export type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

export interface ISubscribeOpts {
  table: string;
  /** PostgREST-style filter, e.g. `course_id=eq.<uuid>`. */
  filter?: string;
  event?: ChangeEvent;
  onChange: (payload: any) => void;
}

/**
 * Subscribe to changes on a table. No-op (returns null) when the backend isn't
 * connected. The returned channel is tracked; prefer clearRealtime() for cleanup.
 */
export function subscribe(opts: ISubscribeOpts): RealtimeChannel | null {
  const client = getClient();
  if (!client) {
    return null;
  }
  const name = `rt:${opts.table}:${opts.filter ?? 'all'}:${Math.random().toString(36).slice(2, 8)}`;
  const ch = client.channel(name);
  ch.on(
    'postgres_changes' as any,
    {
      event: opts.event ?? '*',
      schema: 'public',
      table: opts.table,
      ...(opts.filter ? { filter: opts.filter } : {})
    } as any,
    (payload: any) => {
      try {
        opts.onChange(payload);
      } catch {
        /* a subscriber error must never break realtime */
      }
    }
  ).subscribe();
  active.push(ch);
  return ch;
}

/** Remove every active channel. Called by the shell on navigation. */
export function clearRealtime(): void {
  const client = getClient();
  for (const ch of active.splice(0)) {
    try {
      client?.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

/** Trailing debounce — collapse a burst of change events into one refresh. */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 500): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

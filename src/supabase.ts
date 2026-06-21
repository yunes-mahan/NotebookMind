import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;
let _session: Session | null = null;

export function initSupabase(url: string, anonKey: string): void {
  if (!url || url === 'PLACEHOLDER') {
    return;
  }
  _client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: typeof localStorage !== 'undefined' ? localStorage : undefined
    }
  });
  _client.auth.onAuthStateChange((_event, session) => {
    _session = session;
  });
  _client.auth.getSession().then(({ data }) => {
    _session = data.session;
  });
}

export function getClient(): SupabaseClient | null {
  return _client;
}

export function isConnected(): boolean {
  return _client !== null;
}

export function getCurrentUser(): User | null {
  return _session?.user ?? null;
}

export function getCurrentSession(): Session | null {
  return _session;
}

export async function signIn(
  email: string,
  password: string
): Promise<{ user: User | null; error: string | null }> {
  if (!_client) {
    return { user: null, error: 'Supabase not connected.' };
  }
  const { data, error } = await _client.auth.signInWithPassword({ email, password });
  if (error) {
    return { user: null, error: error.message };
  }
  _session = data.session;
  return { user: data.user, error: null };
}

export async function signUp(
  email: string,
  password: string,
  displayName: string
): Promise<{ user: User | null; error: string | null }> {
  if (!_client) {
    return { user: null, error: 'Supabase not connected.' };
  }
  const { data, error } = await _client.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } }
  });
  if (error) {
    return { user: null, error: error.message };
  }
  return { user: data.user, error: null };
}

export async function signOut(): Promise<void> {
  if (_client) {
    await _client.auth.signOut();
  }
  _session = null;
}

// ── Legacy mock exports (kept for compatibility) ─────────────

export type CellState = 'mastered' | 'pending' | 'skipped';

export function getUser() {
  const u = getCurrentUser();
  if (u) {
    return {
      id: u.id,
      email: u.email ?? '',
      name: u.user_metadata?.display_name ?? u.email ?? 'Student'
    };
  }
  return { id: 'demo', email: 'demo@notebookmind.app', name: 'Demo Student' };
}

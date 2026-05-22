import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please add them to your environment variables.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

let cachedSession: Session | null | undefined;
let sessionBootstrapPromise: Promise<Session | null> | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session;
});

export async function getCachedSession() {
  if (cachedSession !== undefined) {
    return cachedSession;
  }

  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          throw error;
        }

        cachedSession = data.session;
        return data.session;
      })
      .finally(() => {
        sessionBootstrapPromise = null;
      });
  }

  return sessionBootstrapPromise;
}

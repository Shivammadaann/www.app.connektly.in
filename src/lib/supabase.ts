import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PASSWORD_RECOVERY_INTENT_KEY = 'connektly:password-recovery-intent';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please add them to your environment variables.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

let cachedSession: Session | null | undefined;
let sessionBootstrapPromise: Promise<Session | null> | null = null;

export function rememberPasswordRecoveryIntent() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(PASSWORD_RECOVERY_INTENT_KEY, '1');
}

export function clearPasswordRecoveryIntent() {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(PASSWORD_RECOVERY_INTENT_KEY);
}

export function hasPasswordRecoveryIntent() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.sessionStorage.getItem(PASSWORD_RECOVERY_INTENT_KEY) === '1';
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    rememberPasswordRecoveryIntent();
  }

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

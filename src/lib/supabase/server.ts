import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicSupabaseConfig } from './env';

export async function createSupabaseServer() {
  const config = publicSupabaseConfig();
  if (!config) {
    return null;
  }
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch {
          // Server Components cannot always persist refreshed cookies.
        }
      },
    },
  });
}

export async function readAuthSession(): Promise<{
  signedIn: boolean;
  emailPresent: boolean;
  ownerInitial: string;
} | null> {
  const supabase = await createSupabaseServer();
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { signedIn: false, emailPresent: false, ownerInitial: 'Y' };
  }
  const email = data.user.email ?? '';
  const initial = email.trim().slice(0, 1).toUpperCase() || 'Y';
  return { signedIn: true, emailPresent: Boolean(email), ownerInitial: initial };
}

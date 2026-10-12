'use client';

import { createBrowserClient } from '@supabase/ssr';
import { publicSupabaseConfig } from './env';

export function createSupabaseBrowser() {
  const config = publicSupabaseConfig();
  if (!config) {
    return null;
  }
  return createBrowserClient(config.url, config.anonKey);
}

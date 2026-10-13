import { AppShell } from '@/components/AppShell';
import { SignInForm } from '@/components/SignInForm';
import { publicSupabaseConfig } from '@/lib/supabase/env';
import { readAuthSession } from '@/lib/supabase/server';
import { shellProject } from '@/lib/tribute-view';
import { resolveSessionSecret } from '@/server/account-session';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export default async function SignInPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const session = await readAuthSession();
  const configured = Boolean(publicSupabaseConfig());
  const passwordReady = Boolean(await resolveSessionSecret());
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={session?.ownerInitial ?? shell.ownerInitial}
      locale={locale}
    >
      <SignInForm configured={configured} passwordReady={passwordReady} locale={locale} />
    </AppShell>
  );
}

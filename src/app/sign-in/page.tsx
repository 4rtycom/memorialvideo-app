import { AppShell } from '@/components/AppShell';
import { SignInForm } from '@/components/SignInForm';
import { publicSupabaseConfig } from '@/lib/supabase/env';
import { readAuthSession } from '@/lib/supabase/server';
import { shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';

export default async function SignInPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);
  const session = await readAuthSession();
  const configured = Boolean(publicSupabaseConfig());

  return (
    <AppShell
      brand={shell.brand}
      title={shell.title}
      ownerInitial={session?.ownerInitial ?? shell.ownerInitial}
    >
      <SignInForm configured={configured} />
    </AppShell>
  );
}

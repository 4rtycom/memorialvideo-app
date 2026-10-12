import { AppShell } from '@/components/AppShell';
import { SetupForm } from '@/components/SetupForm';
import { shellProject } from '@/lib/tribute-view';
import { loadActiveTribute } from '@/server/session';

export default async function SetupPage() {
  const tribute = await loadActiveTribute();
  const shell = shellProject(tribute);

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial}>
      <SetupForm />
    </AppShell>
  );
}

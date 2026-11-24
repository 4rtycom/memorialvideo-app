import { AppShell } from '@/components/AppShell';
import { SetupForm } from '@/components/SetupForm';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';
import { pageTitle } from '@/server/page-title';

export const metadata = { title: 'Set up' };

export async function generateMetadata() {
  return pageTitle('creator.home.storyBegin');
}

export default async function SetupPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute, locale);

  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial} locale={locale}>
      <SetupForm locale={locale} />
    </AppShell>
  );
}

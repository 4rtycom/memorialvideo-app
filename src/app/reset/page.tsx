import { AppShell } from '@/components/AppShell';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';
import { shellProject } from '@/lib/tribute-view';
import { resolveCreatorLocaleWithTribute } from '@/server/locale';
import { loadActiveTribute } from '@/server/session';

export const metadata = { title: 'Reset password', robots: { index: false } };

export default async function ResetPage() {
  const tribute = await loadActiveTribute();
  const locale = await resolveCreatorLocaleWithTribute(tribute?.locale ?? null);
  const shell = shellProject(tribute, locale);
  return (
    <AppShell brand={shell.brand} title={shell.title} ownerInitial={shell.ownerInitial} locale={locale}>
      <ResetPasswordForm locale={locale} />
    </AppShell>
  );
}

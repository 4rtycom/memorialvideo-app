import { LegalPage } from '@/components/LegalPage';
import { pageTitle } from '@/server/page-title';

export const metadata = { title: 'Cookies' };

export async function generateMetadata() {
  return pageTitle('creator.legal.cookies');
}

export default function CookiesPage() {
  return <LegalPage page="cookies" />;
}

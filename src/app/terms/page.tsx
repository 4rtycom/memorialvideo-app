import { LegalPage } from '@/components/LegalPage';
import { pageTitle } from '@/server/page-title';

export const metadata = { title: 'Terms' };

export async function generateMetadata() {
  return pageTitle('creator.legal.terms');
}

export default function TermsPage() {
  return <LegalPage page="terms" />;
}

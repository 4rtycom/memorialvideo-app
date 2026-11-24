import { LegalPage } from '@/components/LegalPage';
import { pageTitle } from '@/server/page-title';


export async function generateMetadata() {
  return pageTitle('creator.legal.privacy');
}

export default function PrivacyPage() {
  return <LegalPage page="privacy" />;
}

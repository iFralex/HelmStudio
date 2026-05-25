import { LegalPage } from '@/components/public/legal-page';

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LegalPage locale={locale} namespace="Privacy" />;
}

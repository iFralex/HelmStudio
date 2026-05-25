import { LegalPage } from '@/components/public/legal-page';

export default async function CookiePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <LegalPage locale={locale} namespace="Cookie" />;
}

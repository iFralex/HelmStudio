import { setRequestLocale, getTranslations } from 'next-intl/server';
import { SectionBadge } from '@/components/public/section-badge';
import { HighlightedHeading } from '@/components/public/highlighted-heading';
import { HazardStripe } from '@/components/public/hazard-stripe';
import { ContactForm } from './contact-form';
import { buildPageMetadata } from '@/lib/seo/metadata';
import type { Locale } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  return buildPageMetadata({ locale, page: 'contact', path: '/contatti' });
}

export default async function ContattiPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('Contact');
  const tForm = await getTranslations('Contact.form');
  const tFooter = await getTranslations('Footer');
  const displayEmail = t('contactEmail');

  return (
    <>
      <HazardStripe delay={0} />

      <section className="bg-blueprint">
        <div className="mx-auto max-w-[1400px] px-6 md:px-12 lg:px-20 pt-16 pb-24 md:pt-24 md:pb-32">
          <SectionBadge number={t('badgeNumber')} label={t('badgeLabel')} />

          <HighlightedHeading
            text={t('title')}
            className="mt-10 text-[clamp(2.5rem,8vw,7rem)] max-w-[14ch]"
            baseDelay={120}
            stagger={60}
          />

          <p className="mt-8 max-w-2xl text-lg md:text-xl text-brutal-fg/85 leading-relaxed">
            {t('intro')}
          </p>

          <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-12 md:gap-16 lg:gap-24 items-start">
            <div>
              <ContactForm
                locale={locale}
                labels={{
                  nameLabel: tForm('nameLabel'),
                  namePlaceholder: tForm('namePlaceholder'),
                  emailLabel: tForm('emailLabel'),
                  emailPlaceholder: tForm('emailPlaceholder'),
                  channelLabel: tForm('channelLabel'),
                  channelPlaceholder: tForm('channelPlaceholder'),
                  channelOptional: tForm('channelOptional'),
                  messageLabel: tForm('messageLabel'),
                  messagePlaceholder: tForm('messagePlaceholder'),
                  submit: tForm('submit'),
                  submitting: tForm('submitting'),
                  successTitle: tForm('successTitle'),
                  successBody: tForm('successBody'),
                  errorTitle: tForm('errorTitle'),
                  errorBody: tForm('errorBody', { email: displayEmail }),
                }}
              />
            </div>

            <aside className="md:pt-2 space-y-8">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted mb-3">
                  ↳ {t('altLabel')}
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
                  {t('altEmailLabel')}
                </p>
                <a
                  href={`mailto:${displayEmail}`}
                  className="mt-1 inline-block font-display font-semibold text-xl md:text-2xl text-brutal-fg hover:text-brutal-accent transition-colors break-all"
                >
                  {displayEmail}
                </a>
              </div>

              <div className="border-t-2 border-brutal-fg/15 pt-6 space-y-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
                  {t('altOfficeLabel')}
                </p>
                <p className="font-display font-medium text-base md:text-lg leading-snug">
                  {tFooter('company')}
                </p>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-brutal-muted">
                  {tFooter('address')}
                </p>
              </div>

              <div className="border-t-2 border-brutal-fg/15 pt-6 space-y-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
                  {t('altOfficesLabel')}
                </p>
                <ul className="space-y-3">
                  {(t.raw('altOffices') as Array<{ city: string; address: string }>).map((o) => (
                    <li key={o.city} className="leading-tight">
                      <p className="font-display font-medium text-base md:text-lg">{o.city}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brutal-muted mt-0.5">
                        {o.address}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <HazardStripe reverse delay={0} />
    </>
  );
}

import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // Display order in the language switcher follows this array.
  locales: ['en', 'es', 'it', 'de'],
  defaultLocale: 'it',
  localePrefix: 'always',
});

export type Locale = (typeof routing.locales)[number];

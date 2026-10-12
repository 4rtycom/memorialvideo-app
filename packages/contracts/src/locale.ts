import { z } from 'zod';

export const LAUNCH_LANGUAGES = ['en', 'nl', 'de', 'fr', 'es', 'pt', 'it', 'pl'] as const;

export type LaunchLanguage = (typeof LAUNCH_LANGUAGES)[number];

export const launchLanguageSchema = z.enum(LAUNCH_LANGUAGES);

export const SOURCE_LOCALE: LaunchLanguage = 'en';

export const localeTagSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Expected a BCP 47 language or language-region tag');

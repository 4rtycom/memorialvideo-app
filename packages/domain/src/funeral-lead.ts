import { launchLanguageSchema } from '@memorialvideo/contracts';
import { z } from 'zod';

export const funeralLeadSchema = z.object({
  locale: launchLanguageSchema,
  organizationName: z.string().trim().min(2).max(80),
  contactName: z.string().trim().min(2).max(80),
  contactEmail: z.string().trim().email().max(120),
  notes: z.string().trim().max(500).optional().default(''),
});

export type FuneralLeadInput = z.infer<typeof funeralLeadSchema>;

export function parseFuneralLead(input: unknown): FuneralLeadInput | { error: 'invalid' } {
  const parsed = funeralLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'invalid' };
  }
  return parsed.data;
}

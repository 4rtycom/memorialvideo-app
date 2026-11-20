/**
 * Plain-language legal pages. These are DRAFTS based on what the app actually does today
 * (see the cookie list and data list below). Have them reviewed by a lawyer, fill in the
 * company details, then set LEGAL_DRAFT to false to hide the draft notice.
 */
export const LEGAL_DRAFT = true;

/** Optional support address: set NEXT_PUBLIC_SUPPORT_EMAIL to show a contact line and footer link. */
export function supportEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalPageKey = 'privacy' | 'terms' | 'cookies';

export const LEGAL_PAGES: Record<LegalPageKey, { updated: string; sections: LegalSection[] }> = {
  privacy: {
    updated: '2026-11-19',
    sections: [
      {
        heading: 'What we keep',
        paragraphs: [
          'When you create a tribute we store the name you enter, the photos, videos and music you add, the words you write, and the films made from them. If family members add memories through an invitation link, we also keep the name they give.',
          'If you sign in, we store your email address so you can come back to your tributes.',
        ],
      },
      {
        heading: 'Who can see it',
        paragraphs: [
          'Tributes are private by default. Only you, and people you invite, can see what is in them. Nothing is shown publicly unless you choose to share a film.',
          'We do not sell your data and we do not use your photos or films to advertise.',
        ],
      },
      {
        heading: 'Who helps us run the service',
        paragraphs: [
          'We use hosting and storage providers to keep your files, and a payment provider (Stripe) when you buy a Memorial Pack. Payment details go to the payment provider; we never see your card number.',
        ],
      },
      {
        heading: 'Deleting your data',
        paragraphs: [
          'You can delete a tribute at any time from the account page. Deleting removes the tribute together with its photos, videos, music uploads and films, and it cannot be undone.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can ask to see, correct, export or erase the personal data we hold about you, and you can object to how we use it. If you are in the European Union you can also complain to your national data protection authority.',
        ],
      },
    ],
  },
  terms: {
    updated: '2026-11-19',
    sections: [
      {
        heading: 'What this service is',
        paragraphs: [
          'MemorialVideo helps you gather photos, videos and music into a film to remember someone. You stay in control of what you add and who you share it with.',
        ],
      },
      {
        heading: 'What you add',
        paragraphs: [
          'You confirm that you have the right to use the photos, videos and music you upload, or that you have permission from the people who hold those rights. You keep ownership of your content; we only use it to run the service for you.',
          'Please do not upload anything unlawful or anything that harms others.',
        ],
      },
      {
        heading: 'Music',
        paragraphs: [
          'Some music cannot be included in a film you share or play in public. The app tells you when a track needs permission. You are responsible for using music you are allowed to use.',
        ],
      },
      {
        heading: 'Memorial Pack and payments',
        paragraphs: [
          'A Memorial Pack is a one-time purchase that unlocks the features listed when you buy it. Payments are handled by our payment provider. If something goes wrong with a payment or a film, contact us and we will help.',
        ],
      },
      {
        heading: 'Changes and liability',
        paragraphs: [
          'We may improve or change the service. We take care of your files, but you should keep your own copy of films you cannot replace. To the extent the law allows, we are not liable for indirect loss.',
        ],
      },
    ],
  },
  cookies: {
    updated: '2026-11-19',
    sections: [
      {
        heading: 'Only the cookies the service needs',
        paragraphs: [
          'MemorialVideo uses a small number of cookies that are strictly necessary to work. We do not use advertising or tracking cookies, so there is no cookie banner to accept.',
        ],
      },
      {
        heading: 'The cookies we set',
        paragraphs: [
          'Language choice: remembers the language you picked.',
          'Active tribute: remembers which tribute you have open.',
          'Account session: keeps you signed in after you sign in.',
          'Guest session: lets a family member who opened an invitation link add memories without an account.',
        ],
      },
    ],
  },
};

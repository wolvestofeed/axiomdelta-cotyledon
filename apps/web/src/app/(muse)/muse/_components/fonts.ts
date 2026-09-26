import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

/**
 * Two voices: Fraunces carries headings and the brand (the hand in the
 * kitchen), IBM Plex runs the interface and sets every figure (the
 * engineering voice). next/font self-hosts them, which is what satisfies the
 * app's `font-src 'self'` CSP — a Google Fonts <link> would be blocked.
 *
 * Shared by the Muse shell and the floor shell so both render in the same
 * hand.
 */
const museDisplay = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--muse-font-display',
});
const museSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--muse-font-sans',
});
const museMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--muse-font-mono',
});

export const museFontVars = `${museDisplay.variable} ${museSans.variable} ${museMono.variable}`;

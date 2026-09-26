import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

/**
 * Two voices: Fraunces carries headings and the brand (the hand in the
 * farm), IBM Plex runs the interface and sets every figure (the
 * engineering voice). next/font self-hosts them, which is what satisfies the
 * app's `font-src 'self'` CSP — a Google Fonts <link> would be blocked.
 *
 * Shared by the Farm shell and the floor shell so both render in the same
 * hand.
 */
const farmDisplay = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--farm-font-display',
});
const farmSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--farm-font-sans',
});
const farmMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--farm-font-mono',
});

export const farmFontVars = `${farmDisplay.variable} ${farmSans.variable} ${farmMono.variable}`;

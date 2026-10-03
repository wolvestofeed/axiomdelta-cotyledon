import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { devBypass } from '@/server/dev-bypass';
import { previewGate } from '@/server/preview-gate';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Cotyledon',
  description: 'Cotyledon, powered by Ember OS: the production operating system for microgreens and sprouts.',
  // A private preview is not for search engines.
  ...(previewGate() ? { robots: { index: false, follow: false } } : {}),
};

/** The bare HTML shell. The route groups own their own chrome. Under the local development bypass Clerk is not mounted. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shell = (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
  return devBypass() ? shell : <ClerkProvider>{shell}</ClerkProvider>;
}

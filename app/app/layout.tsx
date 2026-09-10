import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Capsule — Your wardrobe',
  description:
    'A home for the clothes you own. Organize your pieces and rediscover your favorites.',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

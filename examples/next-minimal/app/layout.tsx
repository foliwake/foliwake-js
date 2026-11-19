import type { ReactNode } from 'react';

export const metadata = { title: 'Foliwake pages in Next.js' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <a href="/">My app</a>
        </header>
        {children}
      </body>
    </html>
  );
}

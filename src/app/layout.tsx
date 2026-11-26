import type { Metadata } from 'next';
import localFont from 'next/font/local';

import '@/app/globals.css';

import React from 'react';
import QueryProvider from '@/providers/query-provider';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@/components/ui/theme-provider';
import StoreProvider from '@/app/StoreProvider';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Truetym Admin App',
  description: 'Admin App to manage customers',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: 'light' }}>
      <body className={`${geistSans.variable} ${geistMono.variable} a antialiased`}>
        <QueryProvider>
          <StoreProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem
              disableTransitionOnChange
            >
              {children}
              <Toaster position="top-right" richColors />
            </ThemeProvider>
          </StoreProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

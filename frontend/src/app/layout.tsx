import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import { PwaRegister } from "@/components/PwaRegister";
import { themeScript } from "@/components/theme/ThemeProvider";

/**
 * Typography: a native system stack, declared once as `--font-sans` in
 * globals.css and consumed by the Tailwind `font-sans` token.
 *
 * Deliberate choice over a webfont: it renders as Roboto on Android and SF on
 * iOS — both excellent at the small sizes this product relies on — with zero
 * network cost, zero FOUT and no build-time dependency on a font CDN, which
 * matters for users on metered Nigerian mobile data.
 */

export const metadata: Metadata = {
  title: "FuelFinder AI — Find fuel near you in Nigeria",
  description:
    "Find fuel stations near you, compare reported prices, check queues and availability across Nigeria — with community reports and AI-assisted recommendations.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FuelFinder",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  // Matches the browser chrome to each theme's canvas so the status bar does
  // not sit as a bright band above a dark app (or vice versa).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1118" },
  ],
  width: "device-width",
  initialScale: 1,
  // Users must always be able to zoom (WCAG 1.4.4).
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/*
          Applies the persisted (or system) theme BEFORE first paint, so a
          dark-mode user never sees a white flash while React hydrates. It
          must stay blocking and inline — deferring it reintroduces the flash.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full bg-canvas font-sans text-ink-900 antialiased">
        <Providers>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}

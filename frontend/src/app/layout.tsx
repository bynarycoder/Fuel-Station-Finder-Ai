import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import { PwaRegister } from "@/components/PwaRegister";

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
  themeColor: "#0a4d3c",
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
      <body className="h-full bg-canvas font-sans text-ink-900 antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('fuel-finder-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}",
          }}
        />
        <Providers>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}

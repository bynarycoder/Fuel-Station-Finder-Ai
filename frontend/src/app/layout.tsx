import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import { PwaRegister } from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Fuel Station Finder AI",
  description: "Locate fuel stations, check prices, queue times, and availability across Nigeria with crowd-sourced real-time updates and AI verification.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fuel Finder",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#064e3b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full antialiased bg-gray-50 text-gray-900 font-sans">
        <Providers>
          {children}
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Fuel Station Finder AI",
  description: "Locate fuel stations, check prices, queue times, and availability across Nigeria with crowd-sourced real-time updates and AI verification.",
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
        </Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Doto, Silkscreen, Spectral } from "next/font/google";
import "./globals.css";

// Weights are the ones the design uses: Doto 600 (tunnel glyphs) and 900 (display),
// Silkscreen 400 (UI labels), Spectral 400 roman and italic (reading text).
const doto = Doto({
  variable: "--font-doto",
  subsets: ["latin"],
  weight: ["600", "900"],
});

const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  subsets: ["latin"],
  weight: "400",
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "[Your name]",
  description: "A personal landing, by invitation.",
  // Invitation-only site: keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${doto.variable} ${silkscreen.variable} ${spectral.variable} dark h-full antialiased`}
    >
      <body className="h-full">{children}</body>
    </html>
  );
}

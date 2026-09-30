import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Doto, Silkscreen, Spectral } from "next/font/google";
import { resolveSiteUrl } from "@/shared/site/site-url";
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

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const TITLE = "patriciopastor";
const DESCRIPTION = "Historias, escritos y proyectos de Patricio Pastor. Solo con invitación.";

export const metadata: Metadata = {
  metadataBase: new URL(resolveSiteUrl(process.env)),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "es_AR", siteName: TITLE },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  // Invitation-only site: keep it out of search indexes.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0600",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${doto.variable} ${silkscreen.variable} ${spectral.variable} dark h-full antialiased`}
    >
      <head>
        {/* Gambarino's stylesheet is injected by the onboarding, off the critical path. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
      </head>
      <body className="h-full">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
      {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  );
}

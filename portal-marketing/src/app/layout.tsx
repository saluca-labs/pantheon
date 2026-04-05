import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { StructuredData } from "./structured-data";

/**
 * Marketing site root layout.
 * No AuthProvider, BrandingProvider, or ChatWidget — those live on the platform.
 */

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Tiresias - AI Agent Security Platform",
  description:
    "Zero-knowledge agent security for the enterprise. Identity, authorization, and runtime protection - without ever accessing your data.",
  keywords: [
    "AI agent security",
    "zero-trust",
    "agent identity",
    "SoulAuth",
    "enterprise security",
    "privacy-first",
  ],
  openGraph: {
    title: "Tiresias - The Blind Prophet of AI Security",
    description:
      "Tiresias sees threats. Never data. Enterprise-grade agent identity and zero-trust authorization.",
    type: "website",
    siteName: "Tiresias",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tiresias - AI Agent Security Platform",
    description: "Zero-knowledge agent security for the enterprise.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <StructuredData />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${manrope.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}

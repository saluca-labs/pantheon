import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

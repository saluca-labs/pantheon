/**
 * Platform layout - wraps /platform/* marketing routes.
 * These are public product pages (SoulAuth, SoulWatch, SoulGate descriptions)
 * and do not require authentication.
 */
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

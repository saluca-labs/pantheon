import { getSignInUrl } from '@workos-inc/authkit-nextjs';

export default async function LoginPage() {
  const authorizationUrl = await getSignInUrl();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="w-full max-w-md p-8 rounded-xl bg-[#1a1d27] border border-[#2a2d3e] shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Tiresias</h1>
          <p className="text-sm text-[#94a3b8]">Governance-First AI-Security&#8482;</p>
        </div>

        <a
          href={authorizationUrl}
          className="flex items-center justify-center w-full h-12 rounded-lg bg-[#4361EE] text-white font-medium hover:bg-[#3651DE] transition-colors"
        >
          Sign in
        </a>

        <p className="mt-6 text-center text-xs text-[#94a3b8]">
          &copy; {new Date().getFullYear()} Saluca LLC. All rights reserved.
        </p>
      </div>
    </div>
  );
}

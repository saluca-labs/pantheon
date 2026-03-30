import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const SOULAUTH_API_URL =
  process.env.SOULAUTH_INTERNAL_URL || process.env.NEXT_PUBLIC_SOULAUTH_API_URL || "http://soulauth.tiresias.svc.cluster.local";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, username, method } = body;

    // Determine endpoint based on auth method
    const endpoint =
      method === "ldap"
        ? `${SOULAUTH_API_URL}/v1/auth/ldap/login`
        : `${SOULAUTH_API_URL}/v1/auth/local/login`;

    const payload =
      method === "ldap" ? { username, password } : { email, password };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Login failed" }));

      if (response.status === 429) {
        return NextResponse.json(
          { error: "Too many attempts. Please wait a moment and try again." },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: error.detail || "Invalid credentials" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Set session cookies (same pattern as OIDC callback)
    const cookieStore = await cookies();
    const isSecure = process.env.NODE_ENV === "production";

    cookieStore.set("tiresias_oidc_session", data.session_token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: data.expires_in || 28800,
    });

    cookieStore.set(
      "tiresias_oidc_data",
      JSON.stringify({
        email: data.email,
        name: data.display_name,
        role: data.admin_role,
        tenant_id: data.tenant_id,
        expires_at: Date.now() + (data.expires_in || 28800) * 1000,
      }),
      {
        httpOnly: false,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: data.expires_in || 28800,
      }
    );

    return NextResponse.json({
      success: true,
      user: {
        email: data.email,
        name: data.display_name,
        role: data.admin_role,
        tenant_id: data.tenant_id,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

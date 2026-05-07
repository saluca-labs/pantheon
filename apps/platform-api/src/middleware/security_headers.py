"""
Security headers middleware.
Adds OWASP-recommended HTTP security headers to every response.
"""

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


# CSP that matches the Tiresias SPA: no inline scripts, self-hosted fonts and images.
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)

_SECURITY_HEADERS: dict[str, str] = {
    # Force HTTPS for 1 year; include subdomains; eligible for preload list
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    # Prevent MIME-type sniffing
    "X-Content-Type-Options": "nosniff",
    # Block framing entirely (also covered by CSP frame-ancestors but kept for
    # legacy scanner compatibility)
    "X-Frame-Options": "DENY",
    # Explicitly disabled — the header is deprecated and the value '0' tells
    # browsers (and security scanners) it has been intentionally considered
    "X-XSS-Protection": "0",
    # Only send origin when navigating same-origin; strip on cross-origin
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # Opt out of all powerful features by default
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    # Content Security Policy
    "Content-Security-Policy": _CSP,
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Injects HTTP security headers into every response.
    Must be registered after CORSMiddleware so CORS pre-flight responses
    also receive the headers.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers[header] = value
        return response

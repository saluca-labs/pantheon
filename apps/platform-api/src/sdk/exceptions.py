"""
SoulAuth SDK exceptions.
Typed error hierarchy for client-side error handling.
"""


class SoulAuthError(Exception):
    """Base exception for all SoulAuth SDK errors."""

    def __init__(self, message: str, status_code: int | None = None, detail: dict | None = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail or {}
        super().__init__(message)


class AuthenticationError(SoulAuthError):
    """Raised when authentication fails (invalid soulkey, bad credentials)."""

    def __init__(self, message: str = "Authentication failed", **kwargs):
        super().__init__(message, status_code=401, **kwargs)


class AuthorizationError(SoulAuthError):
    """Raised when access is denied by the PDP."""

    def __init__(self, message: str = "Access denied", **kwargs):
        super().__init__(message, status_code=403, **kwargs)


class TokenExpiredError(SoulAuthError):
    """Raised when a capability token has expired."""

    def __init__(self, message: str = "Token has expired", **kwargs):
        super().__init__(message, status_code=401, **kwargs)


class RateLimitError(SoulAuthError):
    """Raised when the client has been rate-limited."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: int | None = None, **kwargs):
        self.retry_after = retry_after
        super().__init__(message, status_code=429, **kwargs)


class NotFoundError(SoulAuthError):
    """Raised when a requested resource is not found."""

    def __init__(self, message: str = "Resource not found", **kwargs):
        super().__init__(message, status_code=404, **kwargs)


class ConnectionError(SoulAuthError):
    """Raised when the SDK cannot connect to the SoulAuth service."""

    def __init__(self, message: str = "Cannot connect to SoulAuth service", **kwargs):
        super().__init__(message, status_code=None, **kwargs)


class ValidationError(SoulAuthError):
    """Raised when request validation fails (bad input)."""

    def __init__(self, message: str = "Validation error", **kwargs):
        super().__init__(message, status_code=422, **kwargs)

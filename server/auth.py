"""
Clerk JWT auth for FastAPI. Set CLERK_JWKS_URL in .env (e.g. https://<your-clerk-instance>.clerk.accounts.dev/.well-known/jwks.json).
When unset, auth-protected routes return 503; optional auth returns None.
"""
import os
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "").strip()

if CLERK_JWKS_URL:
    from fastapi_clerk_auth import ClerkConfig, ClerkHTTPBearer

    _clerk_config = ClerkConfig(jwks_url=CLERK_JWKS_URL, verify_iat=True)
    clerk_auth = ClerkHTTPBearer(config=_clerk_config, auto_error=True)
    clerk_auth_optional = ClerkHTTPBearer(config=_clerk_config, auto_error=False)
else:
    clerk_auth = None
    clerk_auth_optional = None

_bearer_no_validate = HTTPBearer(auto_error=False)

# Credentials dependency: validate with Clerk when configured, else just read header (no .decoded)
_credentials_dep = clerk_auth_optional if clerk_auth_optional else _bearer_no_validate


def get_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        clerk_auth if clerk_auth else _bearer_no_validate
    ),
) -> str:
    """Require auth and return Clerk user id (sub claim)."""
    if not CLERK_JWKS_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured (set CLERK_JWKS_URL)",
        )
    if not credentials or not getattr(credentials, "decoded", None):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or missing token")
    sub = credentials.decoded.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")
    return sub


def get_user_id_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_credentials_dep),
) -> str | None:
    """Optional auth; return Clerk user id or None."""
    if not CLERK_JWKS_URL or not credentials or not getattr(credentials, "decoded", None):
        return None
    return credentials.decoded.get("sub")

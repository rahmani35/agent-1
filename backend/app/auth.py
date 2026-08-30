"""Google OAuth ID Token Verification & Whitelist Protection.
"""

from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel, EmailStr

from .config import ALLOWED_USERS, GOOGLE_CLIENT_ID

security = HTTPBearer(auto_error=False)


class GoogleAuthRequest(BaseModel):
    id_token: str


class UserProfile(BaseModel):
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    sub: str


class AuthResponse(BaseModel):
    token: str
    user: UserProfile


def verify_google_id_token(token_str: str) -> UserProfile:
    """Verifies a Google OAuth ID token, extracting email and validating against ALLOWED_USERS."""
    try:
        request = google_requests.Request()
        # If GOOGLE_CLIENT_ID is provided, verify audience
        id_info = id_token.verify_oauth2_token(
            token_str,
            request,
            audience=GOOGLE_CLIENT_ID if GOOGLE_CLIENT_ID else None,
        )

        email = id_info.get("email", "").lower()
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token does not contain an email address.",
            )

        # Enforce whitelist if ALLOWED_USERS is defined
        if ALLOWED_USERS and email not in ALLOWED_USERS:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. User '{email}' is not in the allowed users list.",
            )

        return UserProfile(
            email=email,
            name=id_info.get("name"),
            picture=id_info.get("picture"),
            sub=id_info.get("sub", ""),
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google ID Token: {str(e)}",
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication verification error: {str(e)}",
        ) from e


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> UserProfile:
    """FastAPI Dependency guarding endpoints with Google OAuth ID token."""
    if not credentials or not credentials.credentials:
        # Development bypass if no ALLOWED_USERS is set and client ID is missing
        if not ALLOWED_USERS and not GOOGLE_CLIENT_ID:
            return UserProfile(
                email="dev-local-user@example.com",
                name="Local Developer",
                sub="dev-12345",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer token.",
        )

    return verify_google_id_token(credentials.credentials)

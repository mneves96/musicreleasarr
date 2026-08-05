"""Authentification compte unique : hash bcrypt + session opaque stockee en base
et posee dans un cookie HttpOnly. Pas de JWT (rien a decoder cote client, une
session revoquee en base est immediatement invalide - important pour le
changement de mot de passe et la deconnexion)."""

import secrets
from datetime import datetime, timedelta

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .db import get_db
from .models import AppUser, AuthSession

COOKIE_NAME = "session"
SESSION_DURATION = timedelta(days=30)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_session(db: Session, user: AppUser, response: Response, request: Request) -> None:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            token=token,
            user_id=user.id,
            expires_at=datetime.utcnow() + SESSION_DURATION,
        )
    )
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        max_age=int(SESSION_DURATION.total_seconds()),
        path="/",
    )


def clear_session(db: Session, token: str | None, response: Response) -> None:
    if token:
        db.query(AuthSession).filter(AuthSession.token == token).delete()
        db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")


def get_current_user(
    session: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> AppUser | None:
    if not session:
        return None
    auth_session = db.query(AuthSession).filter(AuthSession.token == session).first()
    if auth_session is None or auth_session.expires_at < datetime.utcnow():
        return None
    return db.get(AppUser, auth_session.user_id)


def require_auth(user: AppUser | None = Depends(get_current_user)) -> AppUser:
    if user is None:
        raise HTTPException(401, "Authentification requise")
    return user

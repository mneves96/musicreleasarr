import time

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import (
    COOKIE_NAME,
    clear_session,
    create_session,
    get_current_user,
    hash_password,
    require_auth,
    verify_password,
)
from ..db import get_db
from ..models import AppUser, AuthSession

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Ralentit le brute-force sur /login sans systeme de verrouillage complexe -
# suffisant pour une app mono-utilisateur qui n'a pas vocation a etre exposee
# directement sur l'internet public.
FAILED_LOGIN_DELAY_SECONDS = 0.5


class StatusOut(BaseModel):
    needs_setup: bool
    authenticated: bool
    username: str | None = None


class CredentialsIn(BaseModel):
    username: str
    password: str


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.get("/status", response_model=StatusOut)
def status(db: Session = Depends(get_db), user: AppUser | None = Depends(get_current_user)):
    needs_setup = db.query(AppUser).first() is None
    return StatusOut(needs_setup=needs_setup, authenticated=user is not None, username=user.username if user else None)


@router.post("/setup", response_model=StatusOut)
def setup(payload: CredentialsIn, response: Response, request: Request, db: Session = Depends(get_db)):
    if db.query(AppUser).first() is not None:
        raise HTTPException(409, "Un compte existe deja")
    if len(payload.username.strip()) < 3:
        raise HTTPException(422, "Nom d'utilisateur trop court (3 caracteres minimum)")
    if len(payload.password) < 8:
        raise HTTPException(422, "Mot de passe trop court (8 caracteres minimum)")

    user = AppUser(username=payload.username.strip(), password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    create_session(db, user, response, request)
    return StatusOut(needs_setup=False, authenticated=True, username=user.username)


@router.post("/login", response_model=StatusOut)
def login(payload: CredentialsIn, response: Response, request: Request, db: Session = Depends(get_db)):
    user = db.query(AppUser).filter(AppUser.username == payload.username.strip()).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        time.sleep(FAILED_LOGIN_DELAY_SECONDS)
        raise HTTPException(401, "Identifiants incorrects")

    create_session(db, user, response, request)
    return StatusOut(needs_setup=False, authenticated=True, username=user.username)


@router.post("/logout")
def logout(response: Response, db: Session = Depends(get_db), session: str | None = Cookie(default=None, alias=COOKIE_NAME)):
    clear_session(db, session, response)
    return {"status": "ok"}


@router.post("/change-password")
def change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_auth),
    session: str | None = Cookie(default=None, alias=COOKIE_NAME),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(401, "Mot de passe actuel incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(422, "Nouveau mot de passe trop court (8 caracteres minimum)")

    user.password_hash = hash_password(payload.new_password)
    # Invalide les autres sessions actives (ex: session volee) - seule celle en
    # cours, deja valide pour cette requete, reste active.
    db.query(AuthSession).filter(AuthSession.user_id == user.id, AuthSession.token != session).delete()
    db.commit()
    return {"status": "ok"}

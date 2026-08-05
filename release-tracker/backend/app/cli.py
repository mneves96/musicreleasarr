"""Commandes d'administration executees dans le conteneur (docker compose exec),
pour les operations qui supposent deja un acces shell au NAS - en particulier
la reinitialisation du mot de passe quand l'utilisateur est bloque hors de
l'app et n'a donc plus la possibilite de passer par /api/auth/change-password.

Usage :
    docker compose exec releases python -m app.cli reset-password
"""

import argparse
import getpass
import sys

from .auth import hash_password
from .db import SessionLocal, init_db
from .models import AppUser


def reset_password() -> None:
    init_db()
    with SessionLocal() as db:
        user = db.query(AppUser).first()
        if user is None:
            print("Aucun compte n'existe encore - lance l'app et cree un compte via l'ecran de premiere connexion.")
            sys.exit(1)

        print(f"Reinitialisation du mot de passe pour le compte '{user.username}'.")
        password = getpass.getpass("Nouveau mot de passe (8 caracteres minimum) : ")
        if len(password) < 8:
            print("Mot de passe trop court (8 caracteres minimum).")
            sys.exit(1)
        confirm = getpass.getpass("Confirme le nouveau mot de passe : ")
        if password != confirm:
            print("Les deux mots de passe ne correspondent pas.")
            sys.exit(1)

        user.password_hash = hash_password(password)
        db.commit()
        print("Mot de passe mis a jour.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("reset-password", help="Reinitialise le mot de passe du compte")

    args = parser.parse_args()
    if args.command == "reset-password":
        reset_password()


if __name__ == "__main__":
    main()

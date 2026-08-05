import logging
import os

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

logger = logging.getLogger("dedieufy.db")

DATA_DIR = os.environ.get("DATA_DIR", "/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "app.db")

# timeout=30 : le scheduler ecrit en arriere-plan toutes les 2 minutes (et plus souvent
# lors d'un scan) pendant qu'une requete web peut vouloir ecrire au meme moment. Le
# mode journal par defaut de SQLite serialise les ecritures ; sans un timeout genereux,
# une collision donnait "database is locked" -> 500 brut sur des endpoints comme
# "suivre un artiste". Le mode WAL (ci-dessous) reduit aussi fortement ces collisions
# en permettant aux lectures de ne jamais bloquer sur une ecriture en cours.
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False, "timeout": 30})


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_missing_columns():
    """Migration minimale : ajoute les colonnes manquantes sur les tables deja
    existantes (create_all ne le fait pas). ALTER TABLE ADD COLUMN ne backfill
    jamais les lignes existantes avec le default cote Python (default= ne joue
    que sur les futurs INSERT via l'ORM) : une colonne non-nullable ajoutee
    ainsi se retrouve a NULL sur les installations existantes, ce qui casse
    ensuite la validation Pydantic des schemas *Out qui la declarent non-optionnelle.

    Le backfill ci-dessous tourne a CHAQUE demarrage, pas seulement pour les
    colonnes qui viennent d'etre ajoutees : une installation qui a deja tourne
    une fois avec la colonne presente-mais-NULL (ex: deployee entre l'ajout de
    la colonne et l'ajout de ce backfill) resterait sinon bloquee a NULL pour
    toujours, puisque `col.name in existing_cols` la ferait sauter des le tour
    suivant. Idempotent et sans cout (WHERE ... IS NULL ne touche plus rien une
    fois la ligne reparee)."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name not in existing_cols:
                col_type = col.type.compile(engine.dialect)
                with engine.begin() as conn:
                    conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}'))

            if not col.nullable and col.default is not None and getattr(col.default, "is_scalar", False):
                with engine.begin() as conn:
                    conn.execute(
                        text(f'UPDATE "{table.name}" SET "{col.name}" = :val WHERE "{col.name}" IS NULL'),
                        {"val": col.default.arg},
                    )


def _relax_tagging_release_id_not_null():
    """tagging_items.release_id a ete cree NOT NULL a l'origine (avant l'ajout
    des fichiers "non identifies", ou release_id doit pouvoir etre NULL) :
    Base.metadata.create_all ne touche jamais aux contraintes d'une table deja
    existante quand le modele Python change, et SQLite n'a pas d'ALTER COLUMN
    - seule une recreation de la table leve cette contrainte sur les
    installations qui avaient deja la table avant ce changement (l'INSERT d'un
    fichier "non identifie" y echouait avec IntegrityError). Recree la table a
    l'identique (colonnes actuelles, quelles qu'elles soient) en rendant
    uniquement release_id nullable, puis recopie les donnees - aucune perte."""
    inspector = inspect(engine)
    if "tagging_items" not in inspector.get_table_names():
        return
    columns = inspector.get_columns("tagging_items")
    release_id_col = next((c for c in columns if c["name"] == "release_id"), None)
    if release_id_col is None or release_id_col["nullable"]:
        return  # deja nullable (nouvelle installation, ou deja migree)

    logger.info("Migration : leve la contrainte NOT NULL sur tagging_items.release_id")
    col_names = [c["name"] for c in columns]
    col_defs = []
    for col in columns:
        type_str = col["type"].compile(engine.dialect)
        parts = [f'"{col["name"]}"', type_str]
        if col["name"] == "id":
            parts.append("PRIMARY KEY")
        elif col["name"] != "release_id" and not col["nullable"]:
            parts.append("NOT NULL")
        if col["name"] == "source_path":
            parts.append("UNIQUE")
        col_defs.append(" ".join(parts))

    cols_csv = ", ".join(f'"{name}"' for name in col_names)
    with engine.begin() as conn:
        conn.execute(text(f'CREATE TABLE tagging_items_new ({", ".join(col_defs)})'))
        conn.execute(text(f'INSERT INTO tagging_items_new ({cols_csv}) SELECT {cols_csv} FROM tagging_items'))
        conn.execute(text("DROP TABLE tagging_items"))
        conn.execute(text("ALTER TABLE tagging_items_new RENAME TO tagging_items"))


def _backfill_tagging_source_folder():
    """TaggingItem.source_folder est desormais fige a la creation (voir
    services/tagging.py:scan_downloads_root), pour rester correct meme si le
    fichier est range plus profondement que ce que reverrait un simple
    basename(dirname()) (ex: Artiste/Album/piste.mp3). Ce backfill dedie
    complete les lignes creees avant ce changement avec basename(dirname()),
    qui est exact pour elles puisqu'elles viennent toutes de l'ancien scan
    limite a un seul niveau de dossier.

    Cible UNIQUEMENT NULL (jamais migree), pas "" : la chaine vide est une
    valeur legitime depuis l'ajout des fichiers "en vrac" a la racine
    (LOOSE_FILES_FOLDER = ""). Ce backfill tournant a CHAQUE demarrage du
    conteneur, cibler aussi "" aurait ecrase ces lignes-la a chaque
    redeploiement (voir models.py:TaggingItem.source_folder, qui n'a plus de
    default cote Python pour que NULL reste NULL tant que ce backfill ne l'a
    pas traite)."""
    inspector = inspect(engine)
    if "tagging_items" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT id, source_path FROM tagging_items WHERE source_folder IS NULL")).fetchall()
        for row_id, source_path in rows:
            folder = os.path.basename(os.path.dirname(source_path))
            conn.execute(text("UPDATE tagging_items SET source_folder = :folder WHERE id = :id"), {"folder": folder, "id": row_id})


def _upgrade_cover_art_resolution():
    """Les URLs de cover deja enregistrees pointaient vers la miniature
    Cover Art Archive front-500 (voir services/coverart.py, corrige depuis vers
    front-1200) - cette meme URL sert a embarquer la pochette dans les tags
    audio (services/tagging.py), ou une miniature 500px degradait nettement le
    rendu. Idempotent : plus aucune ligne ne finit par /front-500 apres la
    premiere execution."""
    inspector = inspect(engine)
    if "releases" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE releases SET cover_url = REPLACE(cover_url, '/front-500', '/front-1200') "
                "WHERE cover_url LIKE '%/front-500'"
            )
        )


def init_db():
    from . import models  # noqa: F401  (ensure models are registered)

    Base.metadata.create_all(bind=engine)
    _relax_tagging_release_id_not_null()
    _add_missing_columns()
    _backfill_tagging_source_folder()
    _upgrade_cover_art_resolution()

    from .models import Settings

    with SessionLocal() as db:
        if db.query(Settings).first() is None:
            db.add(Settings())
            db.commit()

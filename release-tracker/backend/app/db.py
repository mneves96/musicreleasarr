import os

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

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


def _backfill_tagging_source_folder():
    """TaggingItem.source_folder est desormais fige a la creation (voir
    services/tagging.py:scan_downloads_root), pour rester correct meme si le
    fichier est range plus profondement que ce que reverrait un simple
    basename(dirname()) (ex: Artiste/Album/piste.mp3). Le generique
    _add_missing_columns() ci-dessus ne peut le remplir qu'avec le default
    statique "" (pas de valeur calculable par ligne) : ce backfill dedie
    complete les lignes creees avant ce changement avec basename(dirname()),
    qui est exact pour elles puisqu'elles viennent toutes de l'ancien scan
    limite a un seul niveau de dossier."""
    inspector = inspect(engine)
    if "tagging_items" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        rows = conn.execute(
            text('SELECT id, source_path FROM tagging_items WHERE source_folder IS NULL OR source_folder = \'\'')
        ).fetchall()
        for row_id, source_path in rows:
            folder = os.path.basename(os.path.dirname(source_path))
            conn.execute(text("UPDATE tagging_items SET source_folder = :folder WHERE id = :id"), {"folder": folder, "id": row_id})


def init_db():
    from . import models  # noqa: F401  (ensure models are registered)

    Base.metadata.create_all(bind=engine)
    _add_missing_columns()
    _backfill_tagging_source_folder()

    from .models import Settings

    with SessionLocal() as db:
        if db.query(Settings).first() is None:
            db.add(Settings())
            db.commit()

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import artists, releases, search, settings
from .scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler()
    yield
    shutdown_scheduler()


app = FastAPI(title="MusicReleasarr", lifespan=lifespan)

app.include_router(search.router)
app.include_router(artists.router)
app.include_router(releases.router)
app.include_router(settings.router)

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="static-assets")

    # index.html ne doit jamais etre mis en cache par le navigateur : c'est lui qui
    # reference les fichiers JS/CSS hashes (eux, immuables, peuvent l'etre sans risque).
    # Sans ca, un redeploiement peut sembler "ne rien changer" cote navigateur.
    NO_CACHE_HEADERS = {"Cache-Control": "no-cache, no-store, must-revalidate"}

    # Fallback catch-all pour servir le SPA React (routage cote client avec react-router) :
    # tout chemin qui ne correspond a aucune route API ni fichier statique renvoie index.html.
    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"), headers=NO_CACHE_HEADERS)

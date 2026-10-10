"""Vercel entrypoint for the `app` service.

Vercel's FastAPI runtime serves the ASGI `app` it finds in this module. The real
application lives in `ui/server.py` (the Pod test UI + /api/* JSON endpoints the
`shyam-web` frontend proxies to). Importing it here, from the repository root,
keeps `ui`'s package-relative imports (`from . import captures, ...`) working.
"""
from __future__ import annotations

from ui.server import app as app  # re-exported for the Vercel FastAPI runtime

__all__ = ["app"]

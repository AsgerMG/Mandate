"""Data layer: configuration, canonical schema, and session management."""

from .config import EMBEDDING_DIM, Settings, get_settings
from .session import get_engine, get_sessionmaker, init_db, session_scope

__all__ = [
    "EMBEDDING_DIM",
    "Settings",
    "get_settings",
    "get_engine",
    "get_sessionmaker",
    "init_db",
    "session_scope",
]

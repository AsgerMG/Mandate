"""mandate.embedding: Mandate's one embedding model, and the only code that calls one.

    from mandate.embedding import MODEL, DIM, Embedder, for_table, vector_literal

    e = Embedder()                                   # MODEL, documents
    vecs = e.embed(texts)                            # list[list[float]]
    q = for_table("capital.instrument_profiles").embed_query(text)
    e.usage                                          # tokens and dollars this process spent

THE RULE. No code outside this package (and its generated TypeScript mirror,
web/lib/embedding.ts) names an embedding model or calls an
embeddings API. check_boundary.py fails the build when one does. Three setups
(policy voyage-4-large, capital voyage-3.5, capital signals MiniLM) existed
because each call site chose its own model; a query embedded by a model other
than the one its table was embedded with retrieves noise that looks like a
result, and nothing at the call site can see that.

ONE MODEL, AND WHY THERE ARE STILL THREE SPACES. `MODEL` is what every new vector
is written in. A vector already stored is in whatever space it was made in, and a
query against it must use that space -- so `for_table(table)` answers from
spaces.json's `stored` map, not from MODEL. Each legacy space is an IOU with a
written exit (grounding/migrations/reembed_plan.py); when its table is
re-embedded, `stored` flips to MODEL and the legacy entry is deleted.

STORAGE. Vectors are written as pgvector halfvec(1024): 2 bytes a dimension.
`vector_literal` is the text form both vector and halfvec accept.

KEYS. VOYAGE_API_KEY (Voyage's own name, policy's) or VOYAGE_KEY (capital's).
"""
from __future__ import annotations

import json
import os
import random
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

import httpx

_SPEC = json.loads((Path(__file__).resolve().parent / "spaces.json").read_text())

#: The model every new vector is written in.
MODEL: str = _SPEC["model"]
#: Its dimension, and the dimension of every halfvec column in grounding.
DIM: int = _SPEC["dim"]
#: The model queries are embedded with (see spaces.json for why it is MODEL).
QUERY_MODEL: str = _SPEC["query_model"]
#: Which space each stored vector table is in today.
STORED: dict[str, str] = dict(_SPEC["stored"])
#: table -> space -> {"column", "type"}: where a table keeps each space's vectors.
VECTOR_COLUMNS: dict[str, dict[str, dict[str, str]]] = {
    t: {sp: dict(c) for sp, c in by.items()} for t, by in _SPEC["vector_columns"].items()}

ENDPOINT = "https://api.voyageai.com/v1/embeddings"
MAX_LIST = 1000                 # Voyage: "The maximum length of the list is 1,000."
CHARS_PER_TOKEN = 4             # estimate; the API's usage.total_tokens is what is billed
_SAFETY = 0.8                   # headroom under max_request_tokens for the estimate's error


@dataclass(frozen=True)
class Space:
    name: str
    provider: str               # "voyage" | "local"
    dim: int
    input_type: bool            # embed with input_type document/query
    price_per_mtok_usd: float
    max_request_tokens: int
    status: str                 # "target" | "legacy"


SPACES: dict[str, Space] = {
    name: Space(name=name, **{k: v for k, v in s.items() if not k.startswith("_")})
    for name, s in _SPEC["spaces"].items()
}


def space_for_table(table: str) -> Space:
    """The space `table`'s stored vectors are in. A table not listed is an error,
    not a default: guessing is exactly the defect this module exists to remove."""
    if table not in STORED:
        raise KeyError(f"{table!r} is not a registered vector table; add it to "
                       f"mandate/embedding/spaces.json 'stored'")
    return SPACES[STORED[table]]


@dataclass(frozen=True)
class VectorColumn:
    """Where `table` keeps one space's vectors. `cast` is the literal's cast,
    so a query reads `{column} <=> %s::{type}` and the two cannot disagree."""
    table: str
    space: str
    column: str
    type: str            # "vector" | "halfvec"

    @property
    def cast(self) -> str:
        return f"::{self.type}"


def vector_column(table: str, space: str | None = None) -> VectorColumn:
    """The column holding `table`'s vectors in `space` (default: the STORED
    space, i.e. what every reader must query). During a re-embed a table holds
    two spaces side by side; flipping spaces.json `stored` moves every reader."""
    space = space or space_for_table(table).name
    try:
        c = VECTOR_COLUMNS[table][space]
    except KeyError:
        raise KeyError(f"{table!r} has no column for space {space!r} in "
                       f"mandate/embedding/spaces.json 'vector_columns'") from None
    return VectorColumn(table, space, c["column"], c["type"])


def target_column(table: str) -> VectorColumn | None:
    """MODEL's column for `table` while the table is still stored in a legacy
    space, else None (nothing to migrate). Writers fill it alongside the stored
    column, so the re-embed has no gap to close at the flip."""
    if space_for_table(table).name == MODEL or MODEL not in VECTOR_COLUMNS.get(table, {}):
        return None
    return vector_column(table, MODEL)


def column_dim(conn, vc: VectorColumn) -> int | None:
    """The declared dimension of `vc`'s column in the database `conn` reaches
    (pgvector stores it as the type modifier), or None if the column does not
    exist there. Unqualified, so it resolves through the role's search_path:
    a writer asks whether migration 036 has run before it dual-writes."""
    row = conn.execute(
        "SELECT atttypmod FROM pg_attribute WHERE attrelid = to_regclass(%s) "
        "AND attname = %s AND NOT attisdropped", (vc.table.split(".")[-1], vc.column)).fetchone()
    if row is None:
        return None
    v = row[0] if not isinstance(row, dict) else row["atttypmod"]
    return int(v) if v is not None and int(v) > 0 else None


def estimate_tokens(texts: Sequence[str]) -> int:
    return sum(max(1, len(t) // CHARS_PER_TOKEN) for t in texts)


def estimate_cost_usd(tokens: int, model: str = MODEL) -> float:
    return tokens / 1_000_000 * SPACES[model].price_per_mtok_usd


def vector_literal(vec: Sequence[float]) -> str:
    """'[v1,v2,...]': what `$1::halfvec` and `$1::vector` both parse."""
    return "[" + ",".join(repr(float(x)) for x in vec) + "]"


@dataclass
class Usage:
    requests: int = 0
    texts: int = 0
    tokens: int = 0
    cost_usd: float = 0.0
    by_model: dict[str, int] = field(default_factory=dict)

    def add(self, model: str, n_texts: int, tokens: int) -> None:
        self.requests += 1
        self.texts += n_texts
        self.tokens += tokens
        self.cost_usd += estimate_cost_usd(tokens, model)
        self.by_model[model] = self.by_model.get(model, 0) + tokens

    def line(self) -> str:
        return (f"embedding usage: {self.requests} requests, {self.texts:,} texts, "
                f"{self.tokens:,} tokens, ${self.cost_usd:.4f}")


#: What this process has spent, across every Embedder.
USAGE = Usage()


def api_key(env: dict[str, str] | None = None) -> str | None:
    env = os.environ if env is None else env
    return (env.get("VOYAGE_API_KEY") or env.get("VOYAGE_KEY") or "").strip() or None


class EmbeddingError(RuntimeError):
    pass


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code == 429 or exc.response.status_code >= 500
    return False


class Embedder:
    """Embeds in ONE space. `embed(texts)` keeps the shape policy's Embedder
    protocol has always had (`.dim`, `.embed`), so a caller ports by import."""

    def __init__(self, space: str = MODEL, *, key: str | None = None,
                 client: httpx.Client | None = None, attempts: int = 4,
                 timeout_s: float = 60.0, sleep=time.sleep):
        if space not in SPACES:
            raise KeyError(f"unknown embedding space {space!r}")
        self.space = SPACES[space]
        self.model = self.space.name
        self.dim = self.space.dim
        self.usage = Usage()
        self._attempts = attempts
        self._sleep = sleep
        self._local = None
        if self.space.provider == "voyage":
            self._key = key or api_key()
            if not self._key:
                raise EmbeddingError(f"{space} needs VOYAGE_API_KEY (or VOYAGE_KEY)")
            self._client = client or httpx.Client(timeout=timeout_s)
        elif self.space.provider != "local":
            raise EmbeddingError(f"unknown provider {self.space.provider!r}")

    # ── public ────────────────────────────────────────────────────────────
    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return self.embed_documents(texts)

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return self._embed(list(texts), "document")

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], "query")[0]

    # ── internals ─────────────────────────────────────────────────────────
    def _embed(self, texts: list[str], kind: str) -> list[list[float]]:
        if not texts:
            return []
        if self.space.provider == "local":
            return self._embed_local(texts)
        out: list[list[float]] = []
        for batch in self.batches(texts):
            out.extend(self._request(batch, kind))
        for v in out:
            if len(v) != self.dim:
                raise EmbeddingError(f"{self.model} returned {len(v)} dims, expected {self.dim}")
        return out

    def batches(self, texts: list[str]) -> list[list[str]]:
        """Token-aware: a row-count batch of a few very long passages can exceed
        the request cap even when no single text does (policy hit this)."""
        cap = int(self.space.max_request_tokens * _SAFETY)
        batches: list[list[str]] = []
        cur: list[str] = []
        cur_tokens = 0
        for t in texts:
            n = max(1, len(t) // CHARS_PER_TOKEN)
            if cur and (cur_tokens + n > cap or len(cur) >= MAX_LIST):
                batches.append(cur)
                cur, cur_tokens = [], 0
            cur.append(t)
            cur_tokens += n
        if cur:
            batches.append(cur)
        return batches

    def _request(self, batch: list[str], kind: str) -> list[list[float]]:
        body: dict = {"input": batch, "model": self.model, "output_dimension": self.dim}
        if self.space.input_type:
            body["input_type"] = kind
        last: BaseException | None = None
        for attempt in range(self._attempts):
            try:
                r = self._client.post(ENDPOINT, json=body, headers={
                    "authorization": f"Bearer {self._key}", "content-type": "application/json"})
                r.raise_for_status()
                j = r.json()
                tokens = int((j.get("usage") or {}).get("total_tokens") or estimate_tokens(batch))
                self.usage.add(self.model, len(batch), tokens)
                USAGE.add(self.model, len(batch), tokens)
                rows = sorted(j["data"], key=lambda d: d.get("index", 0))
                return [row["embedding"] for row in rows]
            except (httpx.TransportError, httpx.HTTPStatusError) as e:
                last = e
                if not _retryable(e) or attempt == self._attempts - 1:
                    break
                self._sleep(min(20.0, 2 ** attempt) + random.random() * 0.25)
        raise EmbeddingError(f"{self.model} embeddings request failed: {last}") from last

    def _embed_local(self, texts: list[str]) -> list[list[float]]:
        if self._local is None:
            try:
                from fastembed import TextEmbedding  # noqa: PLC0415
            except ImportError as e:
                raise EmbeddingError("the local space needs fastembed: pip install fastembed") from e
            self._local = TextEmbedding(self.model)
        return [v.tolist() for v in self._local.embed(texts, batch_size=128)]


def for_table(table: str, **kw) -> Embedder:
    """The embedder whose space matches what `table` stores. Use this for every
    QUERY against a stored table; use Embedder() (MODEL) for new vectors."""
    return Embedder(space_for_table(table).name, **kw)


__all__ = ["MODEL", "DIM", "QUERY_MODEL", "STORED", "SPACES", "VECTOR_COLUMNS", "Space",
           "VectorColumn", "column_dim", "Embedder", "EmbeddingError", "Usage", "USAGE", "api_key",
           "estimate_cost_usd", "estimate_tokens", "for_table", "space_for_table",
           "target_column", "vector_column", "vector_literal"]

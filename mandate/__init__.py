"""Mandate's shared platform code: what no single brain owns.

    mandate.grounding   the one store of original sources and the passages cited from them
    mandate.embedding   the one embedding model, and the only code that calls an embeddings API

How a brain imports it (both work from one source tree, no copy):
  * policy   path dependency in policy/pyproject.toml ([tool.uv.sources]).
  * capital  ETL/lib/etl_env.py puts the repo root on sys.path.
Both deployables therefore build from the REPO ROOT (Railway root directory `/`),
so the image contains mandate/ beside the brain.
"""

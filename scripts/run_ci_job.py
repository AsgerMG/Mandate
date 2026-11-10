"""Run a GitHub Actions job's `run:` steps locally, read from the workflow file.

The preflight runs CI's own steps instead of a second, hand-kept copy of them
(a copy drifts: that is how capital CI went red on 10 Nov while preflight was
green). `uses:` steps (checkout, setup-*) are skipped; the caller provides the
interpreter. If the job declares a Postgres service, a throwaway local server
(pgserver, with pgvector) stands in for it at the URL the job's env names.

    python scripts/run_ci_job.py .github/workflows/capital-ci.yml etl
"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]


def _expand(value: str, env: dict) -> str:
    """`${{ env.NAME }}`, the one expression our run steps use."""
    import re  # noqa: PLC0415
    return re.sub(r"\$\{\{\s*env\.([A-Z0-9_]+)\s*\}\}", lambda m: env.get(m.group(1), ""), value)


def _throwaway_postgres():
    """A local PostgreSQL 18 + pgvector like CI's pgvector/pgvector:pg18 service
    (Homebrew: brew install postgresql@18 pgvector). Fresh data dir, own port."""
    import shutil, socket  # noqa: E401, PLC0415
    bindir = Path(subprocess.run(["brew", "--prefix", "postgresql@18"], capture_output=True,
                                 text=True, check=True).stdout.strip()) / "bin"
    data = Path(tempfile.mkdtemp(prefix="ci-pg-"))
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]
    subprocess.run([bindir / "initdb", "-D", data / "d", "-U", "postgres", "-A", "trust"],
                   check=True, capture_output=True)
    subprocess.run([bindir / "pg_ctl", "-D", data / "d", "-l", data / "log", "-w", "-o",
                    f"-p {port} -k {data} -c listen_addresses=127.0.0.1", "start"],
                   check=True, capture_output=True)

    def stop():
        subprocess.run([bindir / "pg_ctl", "-D", data / "d", "-m", "fast", "stop"], capture_output=True)
        shutil.rmtree(data, ignore_errors=True)
    return f"postgres://postgres@127.0.0.1:{port}/postgres", stop


def main(workflow: str, job_id: str) -> int:
    wf = yaml.safe_load((ROOT / workflow).read_text())
    job = wf["jobs"][job_id]
    workdir = ROOT / (job.get("defaults", {}).get("run", {}).get("working-directory") or ".")
    env = {**os.environ, **{k: str(v) for k, v in (job.get("env") or {}).items()}}

    stop = None
    if "postgres" in (job.get("services") or {}):
        url, stop = _throwaway_postgres()
        for k, v in list(env.items()):
            if isinstance(v, str) and v.startswith("postgres://postgres:ci@localhost:5432"):
                env[k] = url

    failed = []
    try:
        for step in job["steps"]:
            cmd = step.get("run")
            if not cmd or "pip install" in cmd:   # the caller's env already holds the deps
                continue
            name = step.get("name", cmd.splitlines()[0][:60])
            cwd = ROOT / step["working-directory"] if step.get("working-directory") else workdir
            senv = {**env, **{k: _expand(str(v), env) for k, v in (step.get("env") or {}).items()}}
            r = subprocess.run(["bash", "-e", "-c", cmd], cwd=cwd, env=senv,
                               capture_output=True, text=True)
            if r.returncode != 0:
                failed.append(name)
                print(f"  FAILED: {name}\n" + "\n".join((r.stdout + r.stderr).strip().splitlines()[-12:]))
    finally:
        if stop:
            stop()
    print(f"{job_id}: {len(failed)} step(s) failed" if failed else f"{job_id}: every run step passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))

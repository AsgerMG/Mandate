"""Optional brief self-improvement tooling — off the hot path by default.

Nothing in this package is imported at app/CLI startup. The only production
code that reaches into it is the guarded, flag-gated hook in ``etl/api.py``'s
``/api/brief`` handler (which imports ``etl.brief_eval.logging`` lazily and
only when ``Settings.brief_eval_enabled`` is true). Everything else here —
the eval panel, judge, and candidate search loop — is only imported when you
run ``regina brief-improve`` yourself.

Nothing in this package writes to briefing.py, commits anything, or calls out
over the network except direct Anthropic API calls. It never touches
production behavior — it only tests candidate prompts in-process and reports
what it found.
"""

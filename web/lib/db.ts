// The ONE way this site opens a Postgres connection.
//
// Eight call sites used to repeat the same three lines -- new Client, connect,
// SET statement_timeout -- and two of them carried the reason as a comment the
// others did not. The reason is a fact about the platform, so it lives here once:
//
//   statement_timeout cannot be set at connection time on Railway. Neither the
//   Client() constructor key (sent as a raw startup parameter, rejected) nor
//   libpq's `options: "-c ..."` (Railway's TCP proxy does not forward startup
//   options) gets through. A plain `SET` after connect() is an ordinary command,
//   so nothing in the proxy path has grounds to refuse it.
//
// WHERE THE TABLES ARE is deliberately NOT set here. The capital brain lives in
// schema `capital` of the shared Mandate database, and the connecting role
// (`capital_app`, `capital_ro`) carries `search_path = capital, public` as a role
// default -- see mandate/db/roles.sql. That is in force for every connection the
// role makes, whatever the client, so no code path can forget it.
//
// Server-only: never import this from a "use client" module
// (scripts/check_client_boundary.ts enforces the boundary).
import type { Client } from "pg";

export interface OpenPgOptions {
  /** Give up on the TCP connect after this long. */
  connectMs: number;
  /** Per-statement ceiling for the session; omitted means the server default. */
  statementMs?: number;
}

/** A connected client with the session timeout applied. The caller owns `end()`. */
export async function openPg(url: string, opts: OpenPgOptions): Promise<Client> {
  // Imported lazily, as every call site did before: a route that never reaches
  // the database never pays for loading the driver.
  const { Client: PgClient } = await import("pg");
  const client = new PgClient({ connectionString: url, connectionTimeoutMillis: opts.connectMs });
  await client.connect();
  if (opts.statementMs !== undefined) {
    try {
      await client.query(`SET statement_timeout = ${Math.trunc(opts.statementMs)}`);
    } catch (err) {
      await client.end().catch(() => {});
      throw err;
    }
  }
  return client;
}

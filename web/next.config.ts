import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: no `output: "export"`. The mission route (/api/mandate/mission) is a
  // server-side Route Handler that keeps the Anthropic key off the client,
  // which static export cannot do. Static pages are still statically
  // generated; only the API routes run as serverless functions on Vercel.
  images: { unoptimized: true },
  // Pin the workspace root to this directory so Turbopack doesn't infer the
  // wrong root from a stray lockfile elsewhere on the machine.
  turbopack: { root: __dirname },
  // The agent's fund search (find_instruments -> computeVerdict, through
  // lib/intelligence/corpus.ts) reads the fund-process briefs and the company
  // index from disk at runtime. Public assets are served from the CDN, not
  // bundled into the serverless function, so force-trace both into the
  // function that runs it. (They were traced for /api/intelligence, the
  // retired brief route.)
  outputFileTracingIncludes: {
    "/api/mandate/mission": [
      "./fund-processes/**/*.md",
      "./public/data/companies_index.json",
    ],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: no `output: "export"`. The /api/intelligence route is a server-side
  // Route Handler (POST + streaming) that keeps the Anthropic key off the
  // client, which static export cannot do. Static pages are still statically
  // generated; only the API route runs as a serverless function on Vercel.
  images: { unoptimized: true },
  // Pin the workspace root to this directory so Turbopack doesn't infer the
  // wrong root from a stray lockfile elsewhere on the machine.
  turbopack: { root: __dirname },
  // The intelligence route reads the fund-process briefs and the company index
  // from disk at runtime. Public assets are served from the CDN, not bundled
  // into the serverless function, so force-trace both into the function bundle.
  outputFileTracingIncludes: {
    "/api/intelligence": [
      "./fund-processes/**/*.md",
      "./public/data/companies_index.json",
    ],
  },
};

export default nextConfig;

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DocDetail, STAGE_LABELS, getDocument } from "@/lib/api";

export default function DocumentPage() {
  const params = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = Number(params.id);
    if (!Number.isFinite(id)) return;
    getDocument(id)
      .then(setDoc)
      .catch(() => setError("Couldn't load this document."));
  }, [params.id]);

  if (error) return <div className="notice" style={{ marginTop: 30 }}>{error}</div>;
  if (!doc) return <div className="spinner" style={{ marginTop: 30 }}>Loading…</div>;

  return (
    <>
      <div style={{ marginTop: 24 }}>
        <Link className="back" href="/">
          ← Back to dashboard
        </Link>
      </div>

      <section className="hero" style={{ paddingTop: 18 }}>
        <div
          className="row"
          style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", justifyContent: "flex-start" }}
        >
          <span className={`badge ${doc.stage}`}>{STAGE_LABELS[doc.stage] ?? doc.stage}</span>
          <span className="badge juris">{doc.jurisdiction}</span>
          <span className="badge unknown">{doc.type}</span>
        </div>
        <h1>{doc.title}</h1>
        <div className="meta muted" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {doc.celex && <span>CELEX {doc.celex}</span>}
          {doc.date && <span>Dated {doc.date}</span>}
          {doc.date_in_force && <span>In force {doc.date_in_force}</span>}
          <span>{doc.versions} version(s) tracked</span>
        </div>
        {doc.url && (
          <div style={{ marginTop: 14 }}>
            <a className="btn secondary" href={doc.url} target="_blank" rel="noreferrer">
              Open official source ↗
            </a>
          </div>
        )}
      </section>

      <section className="section">
        <h2>Excerpt</h2>
        <div className="excerpt">{doc.excerpt || "No extracted text available."}</div>
      </section>
    </>
  );
}

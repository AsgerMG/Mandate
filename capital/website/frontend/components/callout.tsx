import { ReactNode } from "react";
import Link from "next/link";

interface CalloutProps {
  title?: string;
  children: ReactNode;
}

export function Callout({ title = "Scope qualifiers", children }: CalloutProps) {
  return (
    <div className="mt-12 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-2">
        {title}
      </p>
      <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">{children}</div>
      <p className="text-xs text-blue-600 dark:text-blue-400 mt-3">
        See{" "}
        <Link href="/methodology" className="underline">methodology</Link> and{" "}
        <Link href="/limitations" className="underline">limitations</Link>.
      </p>
    </div>
  );
}

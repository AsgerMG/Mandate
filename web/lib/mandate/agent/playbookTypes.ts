/** The shipped shape of mandate/playbooks (see playbooksSource.ts). */
export interface PlaybookBundle {
  core: { method: string; wincent: string; regina: string };
  jobs: Record<string, { title: string; text: string }>;
}

// wsDQ — where the record is written. One definition, because three scripts
// hand files to each other and a path retyped in three places is a path that
// eventually disagrees with itself.
import path from "path";

/** The deliverable IS this directory: the owner asked for a readable record of
 *  what happened at every step, not a number. It lives under project-mgmt so
 *  it is committed with the run rather than left in a scratch folder.
 *
 *  `WSDQ_OUT` names a DIFFERENT directory for a re-run, and exists because the
 *  default is not a scratch path — it is wsDQ's committed record, the baseline
 *  every later comparison is read against. A second run at a different lever
 *  writes the same filenames, so without this it would silently overwrite the
 *  control it is being compared to, and the comparison would then be against
 *  itself. Re-running a harness must never be able to delete the thing that
 *  makes the re-run interpretable. */
export const OUT_ROOT = path.join(
  process.cwd(), "..", "capital", "project-mgmt", "findings",
  process.env.WSDQ_OUT ?? "first_test_wsDQ");

/** A directory name a human can read and a shell can type. */
export const slugOf = (company: string): string =>
  company.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// wsDQ — where the record is written. One definition, because three scripts
// hand files to each other and a path retyped in three places is a path that
// eventually disagrees with itself.
import path from "path";

/** The deliverable IS this directory: the owner asked for a readable record of
 *  what happened at every step, not a number. It lives under project-mgmt so
 *  it is committed with the run rather than left in a scratch folder. */
export const OUT_ROOT = path.join(
  process.cwd(), "..", "..", "project-mgmt", "findings", "first_test_wsDQ");

/** A directory name a human can read and a shell can type. */
export const slugOf = (company: string): string =>
  company.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

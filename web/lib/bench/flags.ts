// UI switches for the local bench (/bench). Pure constants: the client page
// reads them (check_client_boundary).

/** Mandates (a client portfolio that groups conversations and picks the
 *  deployed brains). Off until a brain is ready to serve one: the rail section,
 *  "+ New", the mandate pages and the mandate links are hidden, and cases sit
 *  un-grouped under "Recent cases". The code, the store and the API routes
 *  stay as they are; flip this to true to bring the whole surface back. */
export const MANDATES_ENABLED = false;

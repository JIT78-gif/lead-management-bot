import { google } from 'googleapis';
import { db } from '../db/client.js';
import { config } from '../config.js';

// We deliberately don't export a named OAuth2Client type — googleapis
// ships its own copy of google-auth-library and a named import can
// collide with a top-level one. All callers just hold the value
// returned by getAuthClient() and pass it straight to google.calendar
// / google.oauth2 etc.

/**
 * Owner-only Google OAuth — one Google account authorizes once, the
 * bot books Meets on that calendar for every international lead.
 *
 * Token storage is a single-row table (id always = 1) so the lifecycle
 * is trivial: connect overwrites, disconnect deletes. Access tokens
 * are refreshed transparently on demand using the long-lived refresh
 * token.
 *
 * Feature gating: if GOOGLE_OAUTH_CLIENT_ID is empty, the booking
 * feature is disabled and `isConfigured()` returns false. Callers
 * should fall back to the Phase 7 manual flow.
 */

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

interface OAuthRow {
  account_email: string;
  refresh_token: string;
  access_token: string | null;
  access_expires: number | null;
  connected_at: number;
  updated_at: number;
}

const stmtGet = db.prepare<[], OAuthRow>(
  'SELECT * FROM google_oauth WHERE id = 1'
);

const stmtUpsert = db.prepare(
  `INSERT INTO google_oauth (id, account_email, refresh_token, access_token, access_expires, connected_at, updated_at)
   VALUES (1, @account_email, @refresh_token, @access_token, @access_expires, @connected_at, @updated_at)
   ON CONFLICT(id) DO UPDATE SET
     account_email  = excluded.account_email,
     refresh_token  = excluded.refresh_token,
     access_token   = excluded.access_token,
     access_expires = excluded.access_expires,
     updated_at     = excluded.updated_at`
);

const stmtUpdateAccess = db.prepare(
  `UPDATE google_oauth
      SET access_token = @access_token,
          access_expires = @access_expires,
          updated_at = @updated_at
    WHERE id = 1`
);

const stmtDelete = db.prepare('DELETE FROM google_oauth WHERE id = 1');

/** True when the env vars needed to use Google OAuth are set. */
export function isConfigured(): boolean {
  return config.google.clientId !== '' && config.google.clientSecret !== '';
}

/** True when the owner has finished the OAuth dance (we have a refresh token). */
export function isConnected(): boolean {
  if (!isConfigured()) return false;
  return stmtGet.get() !== undefined;
}

export interface OAuthStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connectedAt: number | null;
}

export function getStatus(): OAuthStatus {
  const configured = isConfigured();
  if (!configured) {
    return { configured: false, connected: false, email: null, connectedAt: null };
  }
  const row = stmtGet.get();
  if (!row) {
    return { configured: true, connected: false, email: null, connectedAt: null };
  }
  return {
    configured: true,
    connected: true,
    email: row.account_email,
    connectedAt: row.connected_at,
  };
}

function newOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * URL to redirect the owner to so Google can ask them to consent.
 * `state` is a random opaque value we round-trip through Google to
 * mitigate CSRF — caller stores it in the session and compares on
 * callback.
 */
export function buildAuthUrl(state: string): string {
  const client = newOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',        // gets us a refresh_token
    prompt: 'consent',             // force consent so refresh_token is always issued
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/**
 * Exchanges the OAuth `code` from the callback for tokens, fetches the
 * authenticated user's email (so the dashboard can show it), and
 * persists everything.
 *
 * Throws if Google returns no refresh_token — happens when the user
 * has previously authorized this client and Google omits it. We force
 * `prompt=consent` above to avoid this.
 */
export async function exchangeCode(code: string): Promise<{ email: string }> {
  const client = newOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google did not return a refresh_token. Try again with prompt=consent.');
  }
  client.setCredentials(tokens);

  // Pull the authenticated email so we can label the connection.
  // The googleapis OAuth2 service expects a slightly different
  // OAuth2Client type than what google.auth.OAuth2 returns (version
  // collision in node_modules). They're interface-compatible at
  // runtime — cast through unknown for the typecheck.
  const oauth2 = google.oauth2({
    version: 'v2',
    auth: client as unknown as never,
  });
  const me = await oauth2.userinfo.get();
  const email = me.data.email ?? 'unknown@unknown';

  const now = Date.now();
  stmtUpsert.run({
    account_email: email,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? null,
    access_expires: tokens.expiry_date ?? null,
    connected_at: now,
    updated_at: now,
  });

  return { email };
}

/**
 * Returns an authenticated OAuth2 client with a valid access_token,
 * refreshing if needed. Throws if not connected. Type intentionally
 * inferred so callers don't import the OAuth2Client type directly.
 */
export async function getAuthClient() {
  const row = stmtGet.get();
  if (!row) throw new Error('Google not connected. Owner needs to authorize first.');

  const client = newOAuth2Client();
  client.setCredentials({
    refresh_token: row.refresh_token,
    access_token: row.access_token ?? undefined,
    expiry_date: row.access_expires ?? undefined,
  });

  // Trigger a refresh if access_token is missing or expired. The
  // googleapis SDK exposes a refreshAccessToken helper on the credentials.
  const stillValid =
    row.access_token &&
    row.access_expires &&
    row.access_expires > Date.now() + 60_000; // 1-min safety margin

  if (!stillValid) {
    const refreshed = await client.refreshAccessToken();
    const c = refreshed.credentials;
    stmtUpdateAccess.run({
      access_token: c.access_token ?? null,
      access_expires: c.expiry_date ?? null,
      updated_at: Date.now(),
    });
  }

  return client;
}

export function disconnect(): void {
  stmtDelete.run();
}

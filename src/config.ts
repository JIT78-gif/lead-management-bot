import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const config = {
  port: Number(optional('PORT', '3000')),
  nodeEnv: optional('NODE_ENV', 'production'),

  meta: {
    verifyToken: required('META_VERIFY_TOKEN'),
    phoneNumberId: required('META_PHONE_NUMBER_ID'),
    accessToken: required('META_WHATSAPP_ACCESS_TOKEN'),
    graphApiVersion: optional('META_GRAPH_API_VERSION', 'v21.0'),
  },

  // Gemini (primary). Optional now that OpenRouter can stand in as a full
  // replacement, but at LEAST ONE of GEMINI_API_KEY / OPENROUTER_API_KEY
  // must be set or the bot can't think. Enforced after the object below.
  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    model: optional('GEMINI_MODEL', 'gemini-2.5-flash'),
  },

  // OpenRouter — falls back here when direct Gemini fails (billing block,
  // auth, quota, transient 5xx), OR runs as the sole provider when
  // GEMINI_API_KEY is empty. Use the same Gemini model family by default
  // so bot behavior matches.
  openrouter: {
    apiKey: optional('OPENROUTER_API_KEY', ''),
    model: optional('OPENROUTER_MODEL', 'google/gemini-2.5-flash'),
    // OpenRouter recommends these for attribution; they show up in the
    // OpenRouter dashboard usage breakdown and on rankings pages.
    appName: optional('OPENROUTER_APP_NAME', 'Botifys Lead Desk'),
    appUrl: optional('OPENROUTER_APP_URL', 'https://whatsapp.botifys.com'),
  },

  db: {
    path: optional('DB_PATH', './data/leads.db'),
  },

  dashboard: {
    password: required('DASHBOARD_PASSWORD'),
    sessionSecret: requireMinLength('SESSION_SECRET', 32),
  },

  audio: {
    dir: optional('AUDIO_DIR', './data/audio'),
    maxBytes: Number(optional('MAX_AUDIO_BYTES', '104857600')), // 100 MB
  },

  autoUpload: {
    // Shared token for the salesperson's phone automation app
    // (e.g. Automate / MacroDroid). Rotate to revoke access.
    token: requireMinLength('AUTO_UPLOAD_TOKEN', 24),
  },

  notify: {
    // Comma-separated list of WhatsApp numbers (with country code, no +)
    // who should receive a notification when a new lead qualifies.
    // E.g. "919876543210,919876543211". Leave empty to disable.
    salespersonPhones: optional('SALESPERSON_PHONES', '')
      .split(',')
      .map((s) => s.trim().replace(/\D/g, ''))
      .filter((s) => s.length >= 8),
    // Public dashboard URL used in notification deep links.
    dashboardUrl: optional(
      'DASHBOARD_PUBLIC_URL',
      'https://whatsapp.botifys.com'
    ),
  },

  scheduler: {
    // Phase 5. Set false in local dev to keep cron quiet.
    enabled: optional('SCHEDULER_ENABLED', 'true').toLowerCase() === 'true',
    digestHourIst: Number(optional('DIGEST_HOUR_IST', '9')),
    reminderHourIst: Number(optional('REMINDER_HOUR_IST', '9')),
    // Defaults to ALERT_EMAIL if unset.
    digestRecipient: optional('DIGEST_RECIPIENT', ''),
  },

  // Phase 8 — Google Calendar OAuth + Meet auto-booking for
  // international leads. Leave clientId blank to disable the feature
  // entirely (bot falls back to Phase 7 manual flow).
  google: {
    clientId:     optional('GOOGLE_OAUTH_CLIENT_ID', ''),
    clientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET', ''),
    redirectUri:  optional(
      'GOOGLE_OAUTH_REDIRECT_URI',
      'https://whatsapp.botifys.com/api/auth/google/callback'
    ),
    calendarId:   optional('GOOGLE_CALENDAR_ID', 'primary'),
    meetDurationMinutes: Number(optional('MEET_DURATION_MINUTES', '30')),
    workingDays: optional('WORKING_DAYS', 'mon,tue,wed,thu,fri,sat')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    workingHoursStart: optional('WORKING_HOURS_START', '09:00'),
    workingHoursEnd:   optional('WORKING_HOURS_END', '20:00'),
    workingTimezone:   optional('WORKING_TIMEZONE', 'Asia/Kolkata'),
  },

  alerts: {
    // Resend API key (https://resend.com — free 3,000 emails/month).
    // Leave empty to disable email alerts.
    resendApiKey: optional('RESEND_API_KEY', ''),
    // Email address that should receive error alerts.
    toEmail: optional('ALERT_EMAIL', ''),
    // Sender. Default works out of the box but only delivers to the email
    // attached to your Resend account. For production, verify your own
    // domain in Resend and set this to alerts@yourdomain.com.
    fromEmail: optional('ALERT_FROM_EMAIL', 'onboarding@resend.dev'),
  },
} as const;

// At least one LLM provider must be configured, otherwise the bot can't
// reply at all and we'd ship a silently broken deployment.
if (!config.gemini.apiKey && !config.openrouter.apiKey) {
  throw new Error(
    'No AI provider configured: set GEMINI_API_KEY or OPENROUTER_API_KEY ' +
      '(both is best — gives you automatic fallback).'
  );
}

function requireMinLength(name: string, minLength: number): string {
  const value = required(name);
  if (value.length < minLength) {
    throw new Error(`Env var ${name} must be at least ${minLength} characters`);
  }
  return value;
}

export type Config = typeof config;

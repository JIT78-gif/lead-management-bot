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

  gemini: {
    apiKey: required('GEMINI_API_KEY'),
    model: optional('GEMINI_MODEL', 'gemini-2.5-flash'),
  },

  db: {
    path: optional('DB_PATH', './data/leads.db'),
  },

  dashboard: {
    password: required('DASHBOARD_PASSWORD'),
    sessionSecret: requireMinLength('SESSION_SECRET', 32),
  },
} as const;

function requireMinLength(name: string, minLength: number): string {
  const value = required(name);
  if (value.length < minLength) {
    throw new Error(`Env var ${name} must be at least ${minLength} characters`);
  }
  return value;
}

export type Config = typeof config;

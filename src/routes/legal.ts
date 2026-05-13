import type { FastifyInstance } from 'fastify';

// ─── Edit these to change identity across all three legal pages ───
const BUSINESS_NAME = 'Botifys';
const CONTACT_EMAIL = 'support@botifys.com';
const COUNTRY = 'India';
const LAST_UPDATED = '14 May 2026';

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <title>${title} · ${BUSINESS_NAME}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400..700,30&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      line-height: 1.65;
      color: #0a0a0a;
      background: #fafafa;
      font-size: 16px;
    }
    .wrap {
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 24px 96px;
    }
    header.brand {
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e5e5e5;
    }
    header.brand a {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: inherit;
      text-decoration: none;
    }
    header.brand .name {
      font-family: "Fraunces", "Times New Roman", serif;
      font-weight: 600;
      font-size: 18px;
      letter-spacing: -0.01em;
    }
    header.brand .tag {
      font-size: 10px;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #737373;
      margin-top: 4px;
    }
    h1 {
      font-family: "Fraunces", "Times New Roman", serif;
      font-weight: 500;
      font-size: 40px;
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin: 0 0 8px;
    }
    .meta {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #737373;
      margin-bottom: 40px;
    }
    h2 {
      font-family: "Fraunces", "Times New Roman", serif;
      font-weight: 500;
      font-size: 22px;
      letter-spacing: -0.01em;
      margin: 40px 0 12px;
    }
    h3 {
      font-size: 14px;
      font-weight: 600;
      margin: 24px 0 8px;
      letter-spacing: -0.005em;
    }
    p, li { color: #262626; }
    p { margin: 0 0 14px; }
    ul, ol { padding-left: 22px; margin: 0 0 14px; }
    li { margin-bottom: 6px; }
    a { color: #0a0a0a; }
    code, .mono {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.92em;
      background: #f0f0f0;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .nav {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 13px;
      margin-top: 64px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
      color: #737373;
    }
    .nav a {
      color: #525252;
      text-decoration: none;
    }
    .nav a:hover { color: #0a0a0a; text-decoration: underline; }
    @media (max-width: 480px) {
      .wrap { padding: 32px 20px 80px; }
      h1 { font-size: 32px; }
      h2 { font-size: 20px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="brand">
      <a href="/">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="1.5" y="1.5" width="21" height="21" rx="4" stroke="currentColor" stroke-width="1.5"/>
          <path d="M7 7h6a3 3 0 0 1 0 6H7V7z" fill="currentColor"/>
          <path d="M7 13h7a3 3 0 0 1 0 6H7v-6z" fill="currentColor" opacity="0.55"/>
        </svg>
        <div>
          <div class="name">${BUSINESS_NAME}</div>
          <div class="tag">Lead Desk · ${COUNTRY}</div>
        </div>
      </a>
    </header>

    ${body}

    <nav class="nav">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/data-deletion">Data deletion</a>
      <span style="margin-left:auto">Last updated ${LAST_UPDATED}</span>
    </nav>
  </div>
</body>
</html>`;
}

const PRIVACY_BODY = `
<h1>Privacy Policy</h1>
<p class="meta">Effective ${LAST_UPDATED}</p>

<p>${BUSINESS_NAME} ("we", "us", "our") provides a lead-qualification and sales-management
service that connects with the WhatsApp Business Cloud API. This Privacy Policy
explains what information we collect, how we use it, and the rights you have
over it.</p>

<h2>1. Who we are</h2>
<p>${BUSINESS_NAME} is a business based in ${COUNTRY}. You can contact us at
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> for any privacy question or request.</p>

<h2>2. What we collect</h2>
<h3>When you message our WhatsApp number after clicking our Meta ad</h3>
<ul>
  <li>Your WhatsApp phone number (provided automatically by Meta).</li>
  <li>Your WhatsApp profile name, if available.</li>
  <li>The text content of messages you exchange with our automated assistant.</li>
  <li>Your responses to qualifying questions: business type / industry, team size, business name, website or social handle.</li>
</ul>

<h3>When our sales team calls you</h3>
<ul>
  <li>An audio recording of the call, captured by the salesperson's device call recorder, with your awareness — Indian law permits one-party consent recording.</li>
  <li>An AI-generated transcript of the call.</li>
  <li>An AI-generated summary, key points, objections, and action items.</li>
  <li>An AI-generated "verdict" classification (interested / not interested level) used internally for prioritisation.</li>
</ul>

<h3>When our team logs into the internal dashboard</h3>
<ul>
  <li>A session cookie (<code>HttpOnly</code>, <code>Secure</code>, <code>SameSite=Lax</code>) used only to keep the user signed in to our internal lead-management tool. We do not use marketing or analytics cookies.</li>
</ul>

<h2>3. Why we collect it</h2>
<ul>
  <li>To respond to your inquiry from our Meta advertising.</li>
  <li>To qualify you as a potential customer and prepare our sales team for a follow-up conversation.</li>
  <li>To improve our service quality through post-call review.</li>
</ul>
<p>We process your data on the basis of your consent (when you initiate the
WhatsApp conversation by clicking our ad) and our legitimate interest in
running our business.</p>

<h2>4. Who can see your data</h2>
<p>Your data is accessed only by:</p>
<ul>
  <li><strong>Our internal sales team</strong>, through a password-protected dashboard hosted on our own servers in ${COUNTRY}.</li>
  <li><strong>Meta Platforms</strong>, who deliver the WhatsApp messages between you and our system, per their own privacy policy.</li>
  <li><strong>Google LLC</strong>, who provide the AI text and audio analysis service we use (Gemini API). Your message content and call recordings are transmitted to Google solely for analysis and are processed under Google's API data policies. We do not use Google's services to train models.</li>
</ul>
<p>We do not sell or rent your data to anyone. We do not share it with third
parties for marketing.</p>

<h2>5. How long we keep your data</h2>
<p>We keep qualified-lead records, call recordings, and conversation transcripts
indefinitely so our team can serve you over time. You may request deletion at
any time (see Section 7).</p>

<h2>6. How we protect your data</h2>
<ul>
  <li>All connections to our service use HTTPS (TLS encryption in transit).</li>
  <li>Our dashboard requires a shared team password and a signed session cookie.</li>
  <li>Audio recordings and the database are stored on a private virtual server we operate, not on public storage.</li>
  <li>Access to the underlying server is limited to ${BUSINESS_NAME} owners and authorised administrators.</li>
</ul>

<h2>7. Your rights</h2>
<p>You have the right to:</p>
<ul>
  <li>Ask what data we hold about you.</li>
  <li>Ask us to correct anything that is inaccurate.</li>
  <li>Ask us to delete your data ("right to erasure").</li>
  <li>Withdraw your consent and ask us to stop contacting you.</li>
</ul>
<p>To exercise any of these rights, email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> from the
phone number used to message us, or send "STOP" via WhatsApp from that number.
We will respond within 30 days.</p>

<h2>8. Children</h2>
<p>Our service is intended for business owners and is not directed at children
under 18. We do not knowingly collect data from minors.</p>

<h2>9. Compliance</h2>
<p>We process data in line with:</p>
<ul>
  <li>Meta's WhatsApp Business Messaging Policy and Commerce Policy.</li>
  <li>India's Digital Personal Data Protection Act, 2023.</li>
  <li>The Information Technology Act, 2000 (and related rules) of India.</li>
</ul>

<h2>10. Changes to this policy</h2>
<p>We may update this policy from time to time. The latest version is always
available at this URL with the "last updated" date shown above. Material
changes will be highlighted at the top of this page.</p>

<h2>11. Contact</h2>
<p>For any privacy question or request:
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
`;

const TERMS_BODY = `
<h1>Terms of Service</h1>
<p class="meta">Effective ${LAST_UPDATED}</p>

<h2>1. About this service</h2>
<p>${BUSINESS_NAME} provides a WhatsApp-driven lead qualification, CRM and call
analysis service for our own sales operations. The automated assistant
described in our advertising responds to your messages and gathers basic
information about your business so a human salesperson can follow up.</p>

<h2>2. Acceptable use</h2>
<p>By interacting with our WhatsApp assistant you agree:</p>
<ul>
  <li>Not to send abusive, threatening, or unlawful content.</li>
  <li>Not to send spam, phishing, malware, or unsolicited bulk messages.</li>
  <li>Not to misrepresent your identity or business.</li>
</ul>
<p>We reserve the right to stop responding to anyone who violates these terms.</p>

<h2>3. No guarantees</h2>
<p>Our automated assistant may occasionally misunderstand a message or fail to
respond promptly. The information shared during these conversations and during
sales calls is provided "as is" without warranty. Pricing, availability,
and product details quoted in any conversation are not binding until confirmed
in writing by a ${BUSINESS_NAME} representative.</p>

<h2>4. Intellectual property</h2>
<p>The content of our messaging flows, dashboard and software is the property
of ${BUSINESS_NAME}. You may not copy, redistribute, or reverse-engineer it.</p>

<h2>5. Limitation of liability</h2>
<p>To the extent permitted by law, ${BUSINESS_NAME} is not liable for any indirect,
incidental, or consequential damages arising from your use of this service.</p>

<h2>6. Governing law</h2>
<p>These terms are governed by the laws of ${COUNTRY}. Any dispute arising from
this service shall be subject to the exclusive jurisdiction of the courts of
${COUNTRY}.</p>

<h2>7. Changes</h2>
<p>We may update these terms from time to time. Continued use of the service
constitutes acceptance of the updated terms.</p>

<h2>8. Contact</h2>
<p>Questions about these terms:
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
`;

const DATA_DELETION_BODY = `
<h1>Data deletion request</h1>
<p class="meta">Effective ${LAST_UPDATED}</p>

<p>You have the right to ask ${BUSINESS_NAME} to delete personal data we hold
about you. This page explains how.</p>

<h2>What gets deleted</h2>
<p>On request, we permanently remove:</p>
<ul>
  <li>Your lead record (name, business, industry, team size, website/social).</li>
  <li>The full WhatsApp conversation transcript between you and our assistant.</li>
  <li>Any call recordings, transcripts, summaries and AI-generated analysis associated with your phone number.</li>
  <li>Any internal notes our sales team added about you.</li>
</ul>

<h2>How to request deletion</h2>
<p>Send an email to <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with:</p>
<ul>
  <li>Subject line: <strong>"Data deletion request"</strong>.</li>
  <li>The phone number that was used to message our WhatsApp service.</li>
  <li>A short confirmation: "I request deletion of all data associated with this number."</li>
</ul>
<p>Alternatively, send the word <strong>STOP</strong> from that phone number to our
WhatsApp Business number. We treat that as a deletion request.</p>

<h2>How long it takes</h2>
<p>We action verified deletion requests within <strong>30 days</strong>. Once complete you
will receive a confirmation email at the address you wrote from (or a WhatsApp
acknowledgement if you sent STOP).</p>

<h2>What we cannot delete</h2>
<p>We cannot delete records that we are required by law to retain (for example,
financial records relating to invoiced transactions, kept for tax compliance).
This applies only to existing customers and only to financial records, not to
conversation content.</p>

<h2>Contact</h2>
<p>For anything about your deletion request:
<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
`;

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/privacy', async (_req, reply) => {
    reply.type('text/html; charset=utf-8').send(page('Privacy Policy', PRIVACY_BODY));
  });

  app.get('/terms', async (_req, reply) => {
    reply.type('text/html; charset=utf-8').send(page('Terms of Service', TERMS_BODY));
  });

  app.get('/data-deletion', async (_req, reply) => {
    reply
      .type('text/html; charset=utf-8')
      .send(page('Data Deletion Request', DATA_DELETION_BODY));
  });
}

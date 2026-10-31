/**
 * Email delivery.
 *
 * A provider abstraction rather than a hard-wired mailer, so a deployment can
 * pick its transport with environment variables alone:
 *
 *   EMAIL_PROVIDER=console   prints the message (development only — config/env.js
 *                            refuses to boot production with it)
 *   EMAIL_PROVIDER=smtp      nodemailer; also covers Resend's SMTP interface
 *   EMAIL_PROVIDER=resend    Resend HTTP API
 *   EMAIL_PROVIDER=sendgrid  SendGrid HTTP API
 *   EMAIL_PROVIDER=ses       Amazon SES v2
 *
 * Contract for every provider: resolve on success, throw on failure, and never
 * return a raw API error to a caller — a caller should not be able to learn
 * anything about our mail infrastructure from an error message.
 */
import nodemailer from 'nodemailer';
import { env, isDev } from '../../config/env.js';

let transport; // lazily built, reused across sends
let sesClient;

/**
 * @typedef {object} EmailMessage
 * @property {string} to
 * @property {string} subject
 * @property {string} text
 * @property {string} [html]
 */

function parseFrom() {
  // Accepts both "Name <a@b.com>" and a bare address.
  const raw = env.EMAIL_FROM_NAME
    ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM.replace(/.*<(.*)>.*/, '$1')}>`
    : env.EMAIL_FROM;
  return raw;
}

function smtpTransport() {
  if (transport) return transport;

  if (!env.SMTP_HOST) {
    throw new Error('EMAIL_PROVIDER=smtp requires SMTP_HOST');
  }

  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    // Port 465 is implicit TLS; everything else starts plaintext and upgrades
    // via STARTTLS, which is what `secure: false` means to nodemailer.
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT !== 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });

  return transport;
}

async function getSesClient() {
  if (sesClient) return sesClient;
  if (!env.AWS_REGION) throw new Error('EMAIL_PROVIDER=ses requires AWS_REGION');

  const { SESv2Client } = await import('@aws-sdk/client-sesv2');
  sesClient = new SESv2Client({ region: env.AWS_REGION });
  return sesClient;
}

/**
 * Sends one message through the configured provider.
 * @param {EmailMessage} message
 * @returns {Promise<{ delivered: boolean, provider: string, id?: string }>}
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!to) throw new Error('sendEmail requires a recipient');

  switch (env.EMAIL_PROVIDER) {
    case 'console': {
      // Development transport. Printing the body is the whole point — it makes
      // verification testable without a mail provider.
      // eslint-disable-next-line no-console
      console.log(
        `\n📬 [email:console] → ${to}\n   subject: ${subject}\n${(text ?? '')
          .split('\n')
          .map((l) => `   │ ${l}`)
          .join('\n')}\n`,
      );
      return { delivered: false, provider: 'console' };
    }

    case 'smtp': {
      const info = await smtpTransport().sendMail({
        from: parseFrom(),
        to,
        subject,
        text,
        html: html ?? `<pre style="white-space:pre-wrap;font-family:system-ui">${escapeHtml(text ?? '')}</pre>`,
      });
      return { delivered: true, provider: 'smtp', id: info.messageId };
    }

    case 'resend': {
      if (!env.RESEND_API_KEY) throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY');

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: parseFrom(), to, subject, text, html }),
      });
      if (!res.ok) throw new Error(`Resend rejected the message (${res.status})`);
      const body = await res.json().catch(() => ({}));
      return { delivered: true, provider: 'resend', id: body.id };
    }

    case 'sendgrid': {
      if (!env.SENDGRID_API_KEY) throw new Error('EMAIL_PROVIDER=sendgrid requires SENDGRID_API_KEY');

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: parseFrom(),
          subject,
          content: [
            { type: 'text/plain', value: text },
            ...(html ? [{ type: 'text/html', value: html }] : []),
          ],
        }),
      });
      if (!res.ok) throw new Error(`SendGrid rejected the message (${res.status})`);
      return { delivered: true, provider: 'sendgrid' };
    }

    case 'ses': {
      const { SendEmailCommand } = await import('@aws-sdk/client-sesv2');
      const client = await getSesClient();
      const res = await client.send(
        new SendEmailCommand({
          FromEmailAddress: parseFrom(),
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: text, Charset: 'UTF-8' },
                ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
              },
            },
          },
        }),
      );
      return { delivered: true, provider: 'ses', id: res.MessageId };
    }

    default:
      throw new Error(`Unknown EMAIL_PROVIDER: ${env.EMAIL_PROVIDER}`);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Sends without ever letting a mail failure break the caller's action. A user
 * who cannot be emailed is still a user whose account was created correctly;
 * they can always request another verification mail.
 *
 * @param {EmailMessage} message
 * @returns {Promise<boolean>} whether the message was handed off successfully
 */
export async function trySendEmail(message) {
  try {
    await sendEmail(message);
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('✖ email delivery failed:', err.message);
    return false;
  }
}

const APP_NAME = 'CampusConnect';

/** @param {string} link @param {number} minutes */
export function verificationEmail({ name, link, minutes }) {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: `Confirm your ${APP_NAME} email address`,
    text: `${greeting}

Confirm your email address to finish setting up your ${APP_NAME} account.

Open this link (valid for ${minutes} minutes):

${link}

If you did not create a ${APP_NAME} account you can ignore this email — nothing
happens until the address is confirmed.

— The ${APP_NAME} team`,
    html: `<p>${escapeHtml(greeting)}</p>
<p>Confirm your email address to finish setting up your ${APP_NAME} account.</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Confirm email address</a></p>
<p style="color:#666;font-size:13px">This link expires in ${minutes} minutes. If you did not create a ${APP_NAME} account you can ignore this email.</p>
<p style="color:#666;font-size:13px">If the button does not work, open this link:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
  };
}

/** @param {string} resetLink */
export function passwordResetEmail({ name, resetLink, minutes }) {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: `Reset your ${APP_NAME} password`,
    text: `${greeting}

Someone asked to reset the password for your ${APP_NAME} account.

Open this link (valid for ${minutes} minutes):

${resetLink}

If this wasn't you, no action is needed — your password has not changed.

— The ${APP_NAME} team`,
    html: `<p>${escapeHtml(greeting)}</p>
<p>Someone asked to reset the password for your ${APP_NAME} account.</p>
<p><a href="${resetLink}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
<p style="color:#666;font-size:13px">Expires in ${minutes} minutes. If this wasn't you, no action is needed.</p>
<p style="color:#666;font-size:13px">If the button does not work, open this link:<br><a href="${resetLink}">${escapeHtml(resetLink)}</a></p>`,
  };
}

export const emailTransport = env.EMAIL_PROVIDER;
export const emailIsReal = env.EMAIL_PROVIDER !== 'console';

/** Base URL used to build links in emails. */
export const appUrl = env.SERVER_URL;

export { isDev };

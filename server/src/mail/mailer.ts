// The only sender of mail (P5b). Logs template, recipient domain and outcome only, never a body, link, token or address (Hard rule 13).
import { createTransport, type Transporter } from 'nodemailer';
import { env } from '../env';
import type { MailTemplate } from './templates';

export type MailMessage = { to: string; subject: string; text: string; template: MailTemplate };
export type TestTransport = { sent: MailMessage[] };

let testTransport: TestTransport | null = null;
let transport: Transporter | null = null;

export function setTransportForTests(t: TestTransport | null): void {
  testTransport = t;
}

function logOutcome(msg: MailMessage, ok: boolean): void {
  console.info('mail', { template: msg.template, domain: msg.to.split('@')[1] ?? '', ok });
}

export async function sendMail(msg: MailMessage): Promise<void> {
  if (testTransport) {
    testTransport.sent.push(msg);
    logOutcome(msg, true);
    return;
  }
  if (!env.SMTP_URL || !env.MAIL_FROM) throw new Error('Email is not configured');
  transport ??= createTransport(env.SMTP_URL);
  try {
    await transport.sendMail({ from: env.MAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text });
    logOutcome(msg, true);
  } catch (err) {
    logOutcome(msg, false);
    throw err;
  }
}

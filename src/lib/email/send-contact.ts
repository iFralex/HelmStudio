import { Resend } from 'resend';
import { z } from 'zod';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const ContactSubmissionSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(120),
  email: z.string().trim().email('email_invalid').max(200),
  channel: z.string().trim().max(400).optional().or(z.literal('')),
  message: z.string().trim().min(20, 'message_too_short').max(5000),
  locale: z.enum(['it', 'en', 'de', 'es']),
});

export type ContactSubmission = z.infer<typeof ContactSubmissionSchema>;

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

export type SendContactResult =
  | { ok: true }
  | { ok: false; reason: 'email_service_offline' | 'send_failed'; detail?: string };

export async function sendContact(
  submission: ContactSubmission,
): Promise<SendContactResult> {
  const resend = getResend();
  if (!resend) {
    logger.warn(
      { name: submission.name, email: submission.email },
      'contact form: RESEND_API_KEY missing, skipping email send',
    );
    return { ok: false, reason: 'email_service_offline' };
  }

  const subject = `[helmstudio.it] Nuova richiesta da ${submission.name} (${submission.locale.toUpperCase()})`;
  const channelLine = submission.channel
    ? `Canale / Podcast / Newsletter:\n  ${submission.channel}\n\n`
    : '';
  const body =
    `Nuova richiesta dal form contatti del sito (${submission.locale.toUpperCase()}).\n\n` +
    `Nome: ${submission.name}\n` +
    `Email: ${submission.email}\n\n` +
    channelLine +
    `Messaggio:\n${submission.message}\n\n` +
    `— inviata da helmstudio.it/${submission.locale}/contatti`;

  try {
    const { error } = await resend.emails.send({
      from: env.CONTACT_EMAIL_FROM,
      to: env.CONTACT_EMAIL_TO,
      replyTo: submission.email,
      subject,
      text: body,
    });
    if (error) {
      logger.error({ err: error, name: submission.name }, 'contact form: Resend rejected');
      return { ok: false, reason: 'send_failed', detail: error.message ?? 'unknown' };
    }
    logger.info(
      { name: submission.name, locale: submission.locale },
      'contact form: email sent',
    );
    return { ok: true };
  } catch (err) {
    logger.error({ err, name: submission.name }, 'contact form: send threw');
    return {
      ok: false,
      reason: 'send_failed',
      detail: err instanceof Error ? err.message : 'unknown',
    };
  }
}

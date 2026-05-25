'use server';

import { ContactSubmissionSchema, sendContact } from '@/lib/email/send-contact';

export type ContactActionState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error';
      fieldErrors?: Partial<Record<'name' | 'email' | 'channel' | 'message', string>>;
      message?: string;
    };

export async function submitContactAction(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const parsed = ContactSubmissionSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    channel: formData.get('channel'),
    message: formData.get('message'),
    locale: formData.get('locale'),
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<'name' | 'email' | 'channel' | 'message', string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (
        typeof field === 'string' &&
        (field === 'name' || field === 'email' || field === 'channel' || field === 'message') &&
        !fieldErrors[field]
      ) {
        fieldErrors[field] = issue.message;
      }
    }
    return { status: 'error', fieldErrors };
  }

  const result = await sendContact(parsed.data);
  if (!result.ok) {
    return { status: 'error', message: result.reason };
  }
  return { status: 'success' };
}

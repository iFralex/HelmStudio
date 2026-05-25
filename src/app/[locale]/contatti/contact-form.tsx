'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { submitContactAction, type ContactActionState } from './actions';

type Labels = {
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  channelLabel: string;
  channelPlaceholder: string;
  channelOptional: string;
  messageLabel: string;
  messagePlaceholder: string;
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  errorTitle: string;
  /** Already fully resolved (with the contact email substituted by the server) */
  errorBody: string;
};

const VALIDATION_KEYS: Record<string, string> = {
  name_required: 'nameRequired',
  email_required: 'emailRequired',
  email_invalid: 'emailInvalid',
  message_required: 'messageRequired',
  message_too_short: 'messageTooShort',
};

export function ContactForm({
  locale,
  labels,
}: {
  locale: string;
  labels: Labels;
}) {
  const tv = useTranslations('Contact.validation');
  const [state, formAction, pending] = useActionState<ContactActionState, FormData>(
    submitContactAction,
    { status: 'idle' },
  );

  function localiseError(raw?: string): string | undefined {
    if (!raw) return undefined;
    const key = VALIDATION_KEYS[raw];
    if (!key) return raw;
    try {
      return tv(key);
    } catch {
      return raw;
    }
  }

  if (state.status === 'success') {
    return (
      <div className="border-2 border-brutal-fg bg-brutal-bg p-8 shadow-brutal-sm">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-muted">
          ✓ ok
        </p>
        <h3 className="mt-3 font-display font-bold text-3xl md:text-4xl tracking-tight">
          {labels.successTitle}
        </h3>
        <p className="mt-4 text-lg text-brutal-fg/85 leading-relaxed">
          {labels.successBody}
        </p>
      </div>
    );
  }

  const formError = state.status === 'error' && state.message;

  return (
    <form action={formAction} className="space-y-7" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <Field
        id="name"
        name="name"
        type="text"
        label={labels.nameLabel}
        placeholder={labels.namePlaceholder}
        autoComplete="name"
        required
        error={state.status === 'error' ? localiseError(state.fieldErrors?.name) : undefined}
      />

      <Field
        id="email"
        name="email"
        type="email"
        label={labels.emailLabel}
        placeholder={labels.emailPlaceholder}
        autoComplete="email"
        required
        error={state.status === 'error' ? localiseError(state.fieldErrors?.email) : undefined}
      />

      <Field
        id="channel"
        name="channel"
        type="text"
        label={labels.channelLabel}
        suffixLabel={labels.channelOptional}
        placeholder={labels.channelPlaceholder}
        autoComplete="url"
        error={state.status === 'error' ? localiseError(state.fieldErrors?.channel) : undefined}
      />

      <FieldTextarea
        id="message"
        name="message"
        label={labels.messageLabel}
        placeholder={labels.messagePlaceholder}
        rows={6}
        required
        error={state.status === 'error' ? localiseError(state.fieldErrors?.message) : undefined}
      />

      {formError && (
        <div
          role="alert"
          className="border-2 border-brutal-fg bg-brutal-bg p-4 shadow-brutal-sm"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-accent">
            ⚠ {labels.errorTitle}
          </p>
          <p className="mt-2 text-sm text-brutal-fg/85">
            {labels.errorBody}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="group inline-flex items-center gap-2 bg-brutal-accent text-brutal-accent-fg font-display font-semibold text-base md:text-lg px-6 py-3 border-2 border-brutal-fg shadow-brutal hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-[transform,box-shadow] duration-100 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? labels.submitting : labels.submit}
        <span aria-hidden className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </button>
    </form>
  );
}

function Field({
  id,
  name,
  type,
  label,
  suffixLabel,
  placeholder,
  autoComplete,
  required = false,
  error,
}: {
  id: string;
  name: string;
  type: string;
  label: string;
  suffixLabel?: string;
  placeholder: string;
  autoComplete?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label
          htmlFor={id}
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-fg"
        >
          {label}
          {required && <span aria-hidden className="ml-1 text-brutal-accent">*</span>}
        </label>
        {suffixLabel && (
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brutal-muted">
            {suffixLabel}
          </span>
        )}
      </div>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full border-2 border-brutal-fg bg-brutal-bg px-4 py-3 text-base md:text-lg font-sans text-brutal-fg placeholder:text-brutal-muted/70 focus:outline-none focus:shadow-brutal-sm focus:-translate-y-0.5 transition-[transform,box-shadow] duration-100"
      />
      {error && (
        <p
          id={`${id}-error`}
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-brutal-accent"
        >
          ↳ {error}
        </p>
      )}
    </div>
  );
}

function FieldTextarea({
  id,
  name,
  label,
  placeholder,
  rows,
  required = false,
  error,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  rows: number;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-mono text-[11px] uppercase tracking-[0.22em] text-brutal-fg mb-2"
      >
        {label}
        {required && <span aria-hidden className="ml-1 text-brutal-accent">*</span>}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        placeholder={placeholder}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full border-2 border-brutal-fg bg-brutal-bg px-4 py-3 text-base md:text-lg font-sans text-brutal-fg placeholder:text-brutal-muted/70 leading-relaxed focus:outline-none focus:shadow-brutal-sm focus:-translate-y-0.5 transition-[transform,box-shadow] duration-100 resize-y"
      />
      {error && (
        <p
          id={`${id}-error`}
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-brutal-accent"
        >
          ↳ {error}
        </p>
      )}
    </div>
  );
}

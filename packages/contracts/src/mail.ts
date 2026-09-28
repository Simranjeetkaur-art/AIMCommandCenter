/**
 * Outbound mail, and what an administrator has to decide about it.
 *
 * Two things live here. The provider presets, so an administrator picks a name
 * from a list and supplies one secret rather than knowing a hostname, a port
 * and whether the port wants TLS on connect or after STARTTLS. And the rules
 * for a usable configuration, so the form that collects it and the server that
 * refuses it apply the same test.
 *
 * What is deliberately *not* here: the secret, and anything that touches it.
 * A key is encrypted before it is stored, is never returned by any endpoint,
 * and never reaches the interface package.
 */

/** A provider an administrator can choose, with everything but the secret. */
export interface MailProviderPreset {
  key: string;
  name: string;
  /** Null where the administrator must supply it, as with a custom server. */
  host: string | null;
  port: number;
  /**
   * True for implicit TLS (465). False for 587, where the connection starts
   * plain and is upgraded by STARTTLS -- which is not "insecure", and is the
   * setting most providers actually want.
   */
  secure: boolean;
  /**
   * The username the provider mandates, where it mandates one. SendGrid wants
   * the literal string "apikey" and people lose an afternoon to that.
   */
  fixedUsername: string | null;
  /** What the secret is called by this provider, on screen. */
  secretLabel: string;
  /** Where the administrator gets it. */
  hint: string;
  /** True when host and port are the administrator's to fill in. */
  custom: boolean;
}

export const MAIL_PROVIDERS: readonly MailProviderPreset[] = Object.freeze([
  {
    key: "SMTP",
    name: "Custom SMTP server",
    host: null,
    port: 587,
    secure: false,
    fixedUsername: null,
    secretLabel: "Password",
    hint: "Your own mail server, or any provider not listed here.",
    custom: true,
  },
  {
    key: "SENDGRID",
    name: "SendGrid",
    host: "smtp.sendgrid.net",
    port: 587,
    secure: false,
    fixedUsername: "apikey",
    secretLabel: "API key",
    hint: "Settings → API Keys → Create. The username is the literal word “apikey”, which is filled in for you.",
    custom: false,
  },
  {
    key: "MAILGUN",
    name: "Mailgun",
    host: "smtp.mailgun.org",
    port: 587,
    secure: false,
    fixedUsername: null,
    secretLabel: "SMTP password",
    hint: "Sending → Domain settings → SMTP credentials. The username looks like postmaster@your-domain.",
    custom: false,
  },
  {
    key: "POSTMARK",
    name: "Postmark",
    host: "smtp.postmarkapp.com",
    port: 587,
    secure: false,
    fixedUsername: null,
    secretLabel: "Server API token",
    hint: "Servers → your server → API Tokens. Use the same token as both username and password.",
    custom: false,
  },
  {
    key: "RESEND",
    name: "Resend",
    host: "smtp.resend.com",
    port: 465,
    secure: true,
    fixedUsername: "resend",
    secretLabel: "API key",
    hint: "API Keys → Create. The username is the literal word “resend”, which is filled in for you.",
    custom: false,
  },
  {
    key: "SES",
    name: "Amazon SES",
    host: null,
    port: 587,
    secure: false,
    fixedUsername: null,
    secretLabel: "SMTP password",
    hint: "SES → SMTP settings → Create credentials. The host is regional, e.g. email-smtp.eu-west-1.amazonaws.com. These are SMTP credentials, not your AWS access key.",
    custom: true,
  },
  {
    key: "GMAIL",
    name: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    fixedUsername: null,
    secretLabel: "App password",
    hint: "Requires 2-step verification, then an App Password. Your ordinary Google password will not work.",
    custom: false,
  },
]);

export function mailPreset(key: string): MailProviderPreset | undefined {
  return MAIL_PROVIDERS.find((p) => p.key === key);
}

/** How long a verification link is good for. */
export const EMAIL_VERIFICATION_TTL_HOURS = 24;
/** A floor on how often one may be asked for, so the form cannot post mail at somebody. */
export const EMAIL_VERIFICATION_COOLDOWN_SECONDS = 60;

/** The cohort a verified candidate joins. Held as a setting, not a flag. */
export const INTAKE_COHORT_SETTING = "enrolment.intakeCohortId";
/** Whether verifying enrols at all. */
export const AUTO_ENROL_FLAG = "enrolment.autoOnVerify";

/** What an administrator submits. `secret` is absent when leaving it unchanged. */
export interface MailConfigDraft {
  provider: string;
  fromName: string;
  fromEmail: string;
  host?: string | null;
  port?: number | null;
  secure?: boolean;
  username?: string | null;
  secret?: string | null;
}

export interface MailConfigVerdict {
  ok: boolean;
  problems: string[];
  /** The draft with the preset's fixed values applied, ready to store. */
  resolved: {
    provider: string;
    fromName: string;
    fromEmail: string;
    host: string;
    port: number;
    secure: boolean;
    username: string;
  } | null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Checks a proposed configuration and fills in what the preset decides.
 *
 * `hasStoredSecret` is how "leave the key alone" is expressed: an
 * administrator editing the sender name should not have to paste their API key
 * again, and a form that makes them do so is a form that gets the key written
 * on a sticky note.
 */
export function checkMailConfig(
  draft: MailConfigDraft,
  options: { hasStoredSecret: boolean },
): MailConfigVerdict {
  const problems: string[] = [];
  const preset = mailPreset(draft.provider);

  if (!preset) {
    return {
      ok: false,
      problems: ["Choose a mail provider."],
      resolved: null,
    };
  }

  const fromName = (draft.fromName ?? "").trim();
  const fromEmail = (draft.fromEmail ?? "").trim().toLowerCase();

  if (fromName.length < 2) {
    problems.push(
      "Give a sender name. It is what recipients see in their inbox.",
    );
  }
  if (!EMAIL_SHAPE.test(fromEmail)) {
    problems.push("Give a sender address mail can actually come from.");
  }

  // The preset decides host and port unless it says otherwise.
  const host = (
    preset.custom ? (draft.host ?? "") : (preset.host ?? "")
  ).trim();
  const port = preset.custom ? Number(draft.port ?? preset.port) : preset.port;
  const secure = preset.custom ? Boolean(draft.secure) : preset.secure;

  if (preset.custom && host.length === 0) {
    problems.push("Give the mail server hostname.");
  } else if (preset.custom && /[:/\s]/.test(host)) {
    // "smtp.example.com:2525" is looked up as a hostname and fails with
    // ENOTFOUND at test time; say so now, where it can be fixed.
    problems.push(
      "Give the hostname on its own, without a port, scheme or path. The port has its own field.",
    );
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push("Give a port between 1 and 65535.");
  }

  const username = (preset.fixedUsername ?? draft.username ?? "").trim();
  if (username.length === 0) {
    problems.push("Give the username the provider issued.");
  }

  // A secret is required the first time and optional afterwards. Blank on an
  // edit means "keep what is stored", never "clear it".
  const secret = draft.secret ?? "";
  if (secret.length === 0 && !options.hasStoredSecret) {
    problems.push(`Give the ${preset.secretLabel.toLowerCase()}.`);
  }

  return {
    ok: problems.length === 0,
    problems,
    resolved:
      problems.length === 0
        ? {
            provider: preset.key,
            fromName,
            fromEmail,
            host,
            port,
            secure,
            username,
          }
        : null,
  };
}

/** The kinds of mail this system sends, for the audit log and the admin page. */
export const MAIL_KINDS = {
  VERIFY: "verify",
  WELCOME: "welcome",
  ENROLLED: "enrolled",
  STAFF_NOTICE: "staff-notice",
  PASSWORD_RESET: "password-reset",
  ACCOUNT_EXISTS: "account-exists",
  TEST: "test",
} as const;

export type MailKind = (typeof MAIL_KINDS)[keyof typeof MAIL_KINDS];

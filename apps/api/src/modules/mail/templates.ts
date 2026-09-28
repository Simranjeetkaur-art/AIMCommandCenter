/**
 * What this institution actually says when it writes to somebody.
 *
 * Every message is built here, in one file, so that what goes out can be read
 * without running the system. Two rules hold across all of them:
 *
 *  1. **No password is ever in a message.** Not a temporary one, not a
 *     generated one, not the one somebody just chose. The account's password
 *     is unrecoverable by design and mail is not a confidential channel; a
 *     welcome message names the address to sign in with and links to the sign-in
 *     screen, which is the whole of what a person needs.
 *  2. **Plain text alongside every HTML body.** A mail client that refuses
 *     HTML, a screen reader, and a plain-text archive should all get the
 *     message rather than an empty frame.
 */

export interface Composed {
  subject: string;
  text: string;
  html: string;
}

/** Minimal escaping: these bodies interpolate names and addresses people chose. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One shell for every message.
 *
 * Inline styles and a table-free single column, because mail clients are not
 * browsers: stylesheets are stripped, flexbox is unreliable, and a dark theme
 * that looks right here would be unreadable in a client that forces its own.
 * Light, boring, and legible everywhere beats on-brand and broken in Outlook.
 */
function shell(heading: string, body: string, footer?: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1f">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e9;border-radius:12px;padding:28px">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8a8a95">AIM Command Center</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(heading)}</h1>
    ${body}
  </div>
  <p style="max-width:560px;margin:16px auto 0;font-size:11px;line-height:1.5;color:#8a8a95">
    ${footer ?? "You are receiving this because an account was created with this address at the AIM Academy."}
  </p>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:0 0 20px"><a href="${esc(href)}" style="display:inline-block;background:#b8862b;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px">${esc(label)}</a></p>`;
}

const P = 'style="margin:0 0 14px;font-size:14px;line-height:1.6"';
const SMALL = 'style="margin:0;font-size:12px;line-height:1.6;color:#6a6a75"';

/** Prove the address. Nothing else happens until this is clicked. */
export function verificationEmail(input: {
  name: string;
  link: string;
  hours: number;
}): Composed {
  const { name, link, hours } = input;
  return {
    subject: "Confirm your email to finish enrolling",
    text: [
      `Hello ${name},`,
      "",
      "Confirm this address to finish enrolling at the AIM Academy:",
      link,
      "",
      `The link is good for ${hours} hours. Until it is used, the account cannot sign in.`,
      "",
      "If you did not create this account, ignore this message and nothing further will happen.",
    ].join("\n"),
    html: shell(
      "Confirm your email",
      `<p ${P}>Hello ${esc(name)},</p>
       <p ${P}>Confirm this address to finish enrolling at the AIM Academy.</p>
       ${button(link, "Confirm my email")}
       <p ${SMALL}>The link is good for ${hours} hours. Until it is used, the account cannot sign in.<br>
       If you did not create this account, ignore this message and nothing further will happen.</p>`,
    ),
  };
}

/**
 * Somebody tried to enrol with an address that already has an account.
 *
 * The enrolment screen answers exactly as it does for a new address, so that
 * it cannot be used to find out who is on the roll. This message is how the
 * real owner learns what happened: it goes only to the address itself.
 */
export function accountExistsEmail(input: {
  name: string;
  signInUrl: string;
  resetUrl: string;
}): Composed {
  const { name, signInUrl, resetUrl } = input;
  return {
    subject: "You already have an AIM Academy account",
    text: [
      `Hello ${name},`,
      "",
      "Somebody just tried to create a new AIM Academy account with this address. It already has one, so nothing was created.",
      "",
      `Sign in at: ${signInUrl}`,
      `Forgotten your password? ${resetUrl}`,
      "",
      "If this was not you, you can ignore this message. Your account has not changed.",
    ].join("\n"),
    html: shell(
      "You already have an account",
      `<p ${P}>Hello ${esc(name)},</p>
       <p ${P}>Somebody just tried to create a new AIM Academy account with this address. It already has one, so nothing was created.</p>
       ${button(signInUrl, "Sign in")}
       <p ${P}>Forgotten your password? <a href="${esc(resetUrl)}">Ask for a reset link</a>.</p>
       <p ${SMALL}>If this was not you, you can ignore this message. Your account has not changed.</p>`,
    ),
  };
}

/**
 * Welcome, after verification.
 *
 * States the address they sign in with, and does not state a password. If the
 * reader has forgotten theirs, the reset link on the sign-in screen is the
 * route, and that is said here so nobody writes in asking.
 */
export function welcomeEmail(input: {
  name: string;
  email: string;
  signInUrl: string;
  programme: string | null;
}): Composed {
  const { name, email, signInUrl, programme } = input;
  const enrolled = programme
    ? `You have been enrolled on ${programme}.`
    : "You will be placed on a course shortly. Sign in and open the Academy to see what is open to you.";

  return {
    subject: "Welcome to the AIM Academy",
    text: [
      `Hello ${name},`,
      "",
      "Your email is confirmed and your account is active.",
      enrolled,
      "",
      `Sign in at: ${signInUrl}`,
      `Your account is your email address: ${email}`,
      "",
      "Your password is not included in this message and never will be: it is stored in a form nobody can read back, including us. If you have forgotten it, use “Forgotten your password?” on the sign-in screen.",
    ].join("\n"),
    html: shell(
      "Welcome to the AIM Academy",
      `<p ${P}>Hello ${esc(name)},</p>
       <p ${P}>Your email is confirmed and your account is active. ${esc(enrolled)}</p>
       ${button(signInUrl, "Sign in")}
       <p ${P}>Your account is your email address: <strong>${esc(email)}</strong></p>
       <p ${SMALL}>Your password is not in this message and never will be: it is stored in a form nobody can read back, including us. If you have forgotten it, use &ldquo;Forgotten your password?&rdquo; on the sign-in screen.</p>`,
    ),
  };
}

/** Told to administrators and managers when somebody enrols themselves. */
export function staffNoticeEmail(input: {
  staffName: string;
  candidateName: string;
  candidateEmail: string;
  programme: string | null;
  usersUrl: string;
}): Composed {
  const { staffName, candidateName, candidateEmail, programme, usersUrl } =
    input;
  const placed = programme
    ? `Enrolled on ${programme}.`
    : "Not enrolled: no intake cohort is set, so this candidate needs placing by hand.";

  return {
    subject: `New candidate enrolled: ${candidateName}`,
    text: [
      `Hello ${staffName},`,
      "",
      `${candidateName} (${candidateEmail}) created their own account and confirmed their email address.`,
      placed,
      "",
      `The roll: ${usersUrl}`,
    ].join("\n"),
    html: shell(
      "A new candidate enrolled",
      `<p ${P}>Hello ${esc(staffName)},</p>
       <p ${P}><strong>${esc(candidateName)}</strong> (${esc(candidateEmail)}) created their own account and confirmed their email address.</p>
       <p ${P}>${esc(placed)}</p>
       ${button(usersUrl, "Open the roll")}`,
      "You are receiving this because you administer or manage this academy.",
    ),
  };
}

/** The reset link, now that there is something to send it with. */
export function passwordResetEmail(input: {
  name: string;
  link: string;
  minutes: number;
  issuedByName: string | null;
}): Composed {
  const { name, link, minutes, issuedByName } = input;
  const who = issuedByName
    ? `${issuedByName} started a password reset for your account.`
    : "You asked to reset your password.";

  return {
    subject: "Reset your AIM Command Center password",
    text: [
      `Hello ${name},`,
      "",
      who,
      link,
      "",
      `The link works once and expires in ${minutes} minutes.`,
      "",
      "If this was not you, no action is needed: the link above is the only thing that can change the password, and it will expire unused.",
    ].join("\n"),
    html: shell(
      "Reset your password",
      `<p ${P}>Hello ${esc(name)},</p>
       <p ${P}>${esc(who)}</p>
       ${button(link, "Choose a new password")}
       <p ${SMALL}>The link works once and expires in ${minutes} minutes.<br>
       If this was not you, no action is needed: the link above is the only thing that can change the password, and it will expire unused.</p>`,
    ),
  };
}

/** Proof to an administrator that the configuration they just saved works. */
export function testEmail(input: {
  triggeredBy: string;
  provider: string;
}): Composed {
  const { triggeredBy, provider } = input;
  return {
    subject: "AIM Command Center test message",
    text: [
      "This is a test message from the AIM Command Center.",
      "",
      `Provider: ${provider}`,
      `Requested by: ${triggeredBy}`,
      "",
      "If you are reading this, outbound mail is working and verification, welcome and notification messages will be delivered.",
    ].join("\n"),
    html: shell(
      "Outbound mail is working",
      `<p ${P}>This is a test message from the AIM Command Center.</p>
       <p ${P}><strong>Provider:</strong> ${esc(provider)}<br>
       <strong>Requested by:</strong> ${esc(triggeredBy)}</p>
       <p ${SMALL}>If you are reading this, verification, welcome and notification messages will be delivered too.</p>`,
      "You requested this test from the mail settings screen.",
    ),
  };
}

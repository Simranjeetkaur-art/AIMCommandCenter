import "server-only";
import { notFound, redirect } from "next/navigation";
import {
  PASSWORD_CHANGE_REQUIRED,
  PROFILE_REQUIRED,
  type Permission,
  type SessionEnvelope,
} from "@aim/contracts";
import { getSessionToken } from "./session";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Next.js cache tag, so a mutation can invalidate the right reads. */
  tags?: string[];
  cache?: RequestCache;
}

/**
 * The only way this application talks to the API.
 *
 * It runs on the server, attaches the session from an httpOnly cookie, and is
 * marked server-only so importing it from a client component is a build error
 * rather than a leak. A 401 sends the caller back to sign in; a 403 is left to
 * the page, because a refusal is information the page should show honestly
 * rather than disguise as an empty list.
 */
export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = await getSessionToken();

  const response = await fetch(`${BASE}/api${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: options.cache ?? "no-store",
    next: options.tags ? { tags: options.tags } : undefined,
  });

  if (response.status === 401) redirect("/login?expired=1");

  const text = await response.text();
  const parsed = text ? safeParse(text) : null;

  /**
   * A session that is valid but may do nothing until its password is changed.
   *
   * Told apart from an ordinary 403 by a code rather than by matching on a
   * message, because one of these sends the person to the password screen and
   * the other is the permission matrix doing its job -- and a refusal is
   * information a page should show honestly rather than redirect away from.
   *
   * There is no redirect loop in this: the API leaves `/auth/me`,
   * `/auth/sessions`, `/auth/password` and `/auth/logout` reachable while the
   * hold is on, and those are the only calls the account screen makes.
   */
  if (
    response.status === 403 &&
    (parsed as { error?: string } | null)?.error === PASSWORD_CHANGE_REQUIRED
  ) {
    redirect("/account/security?forced=1");
  }

  // The profile hold, told apart the same way: this one sends the person to
  // complete their profile, and every page that reads data lands them there.
  if (
    response.status === 403 &&
    (parsed as { error?: string } | null)?.error === PROFILE_REQUIRED
  ) {
    redirect("/account/profile?required=1");
  }

  if (!response.ok) {
    const message =
      (parsed as { message?: string | string[] })?.message ??
      `Request failed (${response.status})`;
    throw new ApiError(
      response.status,
      Array.isArray(message) ? message.join("; ") : message,
      parsed,
    );
  }

  return parsed as T;
}

/**
 * Like `api`, but returns null on a refusal instead of throwing.
 *
 * Used where a portal renders several panels and one of them may legitimately
 * be out of scope for the signed-in role. The panel renders an honest "not
 * available to you" rather than the whole page failing.
 */
export async function apiOrNull<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T | null> {
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    )
      return null;
    throw error;
  }
}

export async function getSession(): Promise<SessionEnvelope> {
  return api<SessionEnvelope>("/auth/me");
}

export function can(
  permissions: Permission[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The record an `[id]` page is about, or the not-found page.
 *
 * A well-formed id that does not exist, a garbage one, and one that belongs to
 * somebody outside the caller's scope all come back from the API as 404 (or
 * 400 for a malformed id). Thrown on, those reached the error boundary as a
 * 500. They are the same answer — "there is nothing here for you" — and the
 * page says so without confirming which it was.
 */
export async function apiOrNotFound<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 400)
    ) {
      notFound();
    }
    throw error;
  }
}

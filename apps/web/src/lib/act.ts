import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "./api";

type Options = Parameters<typeof api>[1];

/** Query parameters the flash banner reads. See `components/action-flash.tsx`. */
export const FLASH_REFUSED = "refused";
export const FLASH_DONE = "done";

/**
 * The page the form was submitted from, with any earlier flash removed.
 *
 * A server action is a POST to the page it lives on, so the referer is that
 * page. Only its path and query are kept: a flash must never send somebody to
 * another origin because a header said so.
 */
async function sourcePage(): Promise<URL> {
  const referer = (await headers()).get("referer");
  const url = new URL(referer ?? "/", "http://local");
  url.searchParams.delete(FLASH_REFUSED);
  url.searchParams.delete(FLASH_DONE);
  return url;
}

async function back(param: string, message: string): Promise<never> {
  const url = await sourcePage();
  url.searchParams.set(param, message);
  redirect(`${url.pathname}${url.search}`);
}

/**
 * A write from a server action, with the API's refusal shown rather than lost.
 *
 * `api` throws on a refusal. Thrown out of a server action, that reaches the
 * error boundary, where production builds strip the message and the person
 * reads "Nothing was changed" — even when, after a double-click, the first
 * request did change something. The API's messages are specific and meant to
 * be read ("1 learner(s) hold this badge. Deactivate it instead"), so a 4xx
 * sends the person back to the page they were on with that message shown.
 *
 * Not for use inside a try/catch that swallows everything: `redirect` works by
 * throwing, and a catch-all would eat it.
 */
export async function act<T>(path: string, options: Options = {}): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
      return back(FLASH_REFUSED, error.message);
    }
    throw error;
  }
}

/**
 * Says that a write happened, on the page it happened on.
 *
 * For actions whose result is otherwise invisible — a decision that sends the
 * examiner back to the queue, a create form that clears itself.
 */
export async function done(message: string, to?: string): Promise<never> {
  if (to) {
    const url = new URL(to, "http://local");
    url.searchParams.set(FLASH_DONE, message);
    redirect(`${url.pathname}${url.search}`);
  }
  return back(FLASH_DONE, message);
}

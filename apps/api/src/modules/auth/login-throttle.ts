import { Injectable } from "@nestjs/common";
import { REGISTRATION_LIMIT_PER_ORIGIN } from "@aim/contracts";

/**
 * A brake on guessing, counted by where the guesses come from.
 *
 * There are two brakes on the sign-in path and they catch different attacks.
 * This is the one that catches the attack the other structurally cannot.
 *
 *  - `User.failedLoginCount` / `User.lockedUntil` count failures against one
 *    **account**. Durable, visible to an administrator, clearable by one.
 *  - This counts failures against one **origin**, so one machine trying one
 *    likely password against every address on the roll is stopped. No single
 *    account ever reaches its own limit during a sweep like that, which is
 *    precisely why a per-account column cannot see it.
 *
 * This class used to count by address as well. That half is gone, and not
 * because it was wrong: with the account limit at five in the database and the
 * in-memory one at eight, the database always fired first and the address
 * counter here was unreachable code wearing the shape of a second lock. One
 * rule, in one place, that somebody can actually find.
 *
 * Held in memory, which is an honest limitation and is stated rather than
 * hidden: it resets when the API restarts and it is per-process, so a
 * multi-instance deployment brakes per instance. That is a real reduction in
 * an attacker's rate and not a guarantee; the durable version wants a shared
 * store, and it is written behind this small interface so that swap is one
 * class. The per-account half of the defence *is* durable, which is what makes
 * the limitation here tolerable.
 *
 * A locked origin is refused **before** the account is looked at, and the
 * refusal is identical whether or not the account exists -- otherwise the
 * throttle itself becomes the account oracle that `DUMMY_HASH` exists to
 * prevent.
 */
export const MAX_FAILURES_PER_ORIGIN = 30;
export const FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;

interface Counter {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number | null;
}

@Injectable()
export class LoginThrottle {
  private readonly counters = new Map<string, Counter>();
  /** Bounds the map so a sweep from many forged origins cannot grow it forever. */
  private static readonly MAX_TRACKED = 10_000;

  /**
   * Milliseconds the caller must wait, or null if they may try.
   *
   * A null origin -- no address on the request at all -- is not throttled
   * here. It is not a hole: the per-account lock still applies, and refusing
   * every request that arrives without an address would take the whole system
   * down behind a proxy that stopped forwarding one.
   */
  retryAfterMs(origin: string | null): number | null {
    if (!origin) return null;
    return this.lockRemaining(originKey(origin), Date.now());
  }

  /** Records one failed attempt against the origin it came from. */
  recordFailure(origin: string | null): void {
    if (!origin) return;
    this.bump(originKey(origin), MAX_FAILURES_PER_ORIGIN, Date.now());
  }

  /**
   * The same brake, on enrolment rather than on guessing.
   *
   * Counted separately -- a different key, a much lower limit -- because the
   * two measure different things. A failed sign-in is one guess among many a
   * person might legitimately make; a created account is a person, and a
   * person arrives once. Sharing the login counter would either let a script
   * open thirty accounts or lock a household out of signing in because
   * somebody in it enrolled.
   */
  registrationRetryAfterMs(origin: string | null): number | null {
    if (!origin) return null;
    return this.lockRemaining(registrationKey(origin), Date.now());
  }

  /** Records one account created from this origin, successful or not. */
  recordRegistration(origin: string | null): void {
    if (!origin) return;
    this.bump(
      registrationKey(origin),
      REGISTRATION_LIMIT_PER_ORIGIN,
      Date.now(),
    );
  }

  private lockRemaining(key: string, now: number): number | null {
    const counter = this.counters.get(key);
    if (!counter?.lockedUntil) return null;
    if (counter.lockedUntil <= now) {
      this.counters.delete(key);
      return null;
    }
    return counter.lockedUntil - now;
  }

  private bump(key: string, limit: number, now: number): void {
    const existing = this.counters.get(key);

    if (!existing || now - existing.windowStartedAt > FAILURE_WINDOW_MS) {
      this.prune(now);
      this.counters.set(key, {
        failures: 1,
        windowStartedAt: now,
        lockedUntil: null,
      });
      return;
    }

    existing.failures += 1;
    if (existing.failures >= limit) {
      existing.lockedUntil = now + LOCKOUT_MS;
      // The window restarts with the lock, so the next failure after it lapses
      // is the first of a fresh run rather than instantly re-locking.
      existing.failures = 0;
      existing.windowStartedAt = now;
    }
  }

  private prune(now: number): void {
    if (this.counters.size < LoginThrottle.MAX_TRACKED) return;
    for (const [key, counter] of this.counters) {
      const lapsed =
        now - counter.windowStartedAt > FAILURE_WINDOW_MS &&
        (counter.lockedUntil === null || counter.lockedUntil <= now);
      if (lapsed) this.counters.delete(key);
    }
  }
}

function originKey(origin: string): string {
  return `ip:${origin}`;
}

function registrationKey(origin: string): string {
  return `reg:${origin}`;
}

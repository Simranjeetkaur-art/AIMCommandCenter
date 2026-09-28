"use client";

import { useEffect, useState } from "react";

/**
 * A moment, in the reader's own clock.
 *
 * Pages here render on the server, whose clock is UTC, so a bare
 * `toLocaleString()` there tells an administrator in Chandigarh that a test
 * went out at 6:33 AM when it went out at noon.
 *
 * The first render is a fixed, locale-free UTC string, identical on the server
 * and in the browser. It has to be: the server's locale is not the reader's,
 * and any difference in that first text is a hydration mismatch, which makes
 * React throw the page away and rebuild it -- during which the navigation does
 * not answer clicks. The reader's local form is swapped in once mounted.
 */
export function LocalTime({
  value,
  mode = "datetime",
}: {
  value: string | Date;
  mode?: "datetime" | "time";
}) {
  const date = new Date(value);
  const iso = date.toISOString();
  const [text, setText] = useState(() => utc(iso, mode));

  useEffect(() => {
    setText(local(new Date(iso), mode));
  }, [iso, mode]);

  return (
    <time dateTime={iso} title={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}

/** "2026-09-25 06:33 UTC" -- built by hand, so no locale can change it. */
function utc(iso: string, mode: "datetime" | "time") {
  const [day, rest] = iso.split("T");
  const clock = mode === "time" ? rest.slice(0, 8) : rest.slice(0, 5);
  return mode === "time" ? `${clock} UTC` : `${day} ${clock} UTC`;
}

function local(date: Date, mode: "datetime" | "time") {
  // Explicit fields rather than dateStyle/timeStyle: those refuse to be
  // combined with timeZoneName, and the zone is the point.
  return date.toLocaleString(undefined, {
    ...(mode === "datetime"
      ? { day: "numeric", month: "short", year: "numeric" }
      : {}),
    hour: "numeric",
    minute: "2-digit",
    ...(mode === "time" ? { second: "2-digit" } : {}),
    timeZoneName: "short",
  });
}

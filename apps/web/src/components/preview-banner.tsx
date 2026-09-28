import { PORTAL_HOME, type Role } from "@aim/contracts";
import { endPreview } from "@/app/preview/actions";

/**
 * Says, on every screen, that this is a preview and what that means.
 *
 * Deliberately unmissable and deliberately specific. The dangerous version of
 * this feature is the one where someone forgets they are in it, or believes
 * they have become somebody else. Both are addressed by saying the true thing:
 * the screens belong to another role, the identity is still yours, and nothing
 * can be changed from here.
 */
export function PreviewBanner({
  previewRole,
  name,
  ownRole,
}: {
  previewRole: Role;
  name: string;
  ownRole: Role;
}) {
  const title = previewRole.charAt(0) + previewRole.slice(1).toLowerCase();
  // "an Instructor", "an Admin"; "a Student", "a Manager".
  const article = /^[AEIOU]/.test(title) ? "an" : "a";

  return (
    <div className="mb-5 rounded-xl border border-signal-amber/40 bg-signal-amber/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-signal-amber">
            Previewing the {title} portal
          </p>
          <p className="mt-0.5 text-xs text-ink-300">
            You are still <span className="font-medium">{name}</span>, and still
            recorded as yourself. While this is on you hold {article}{" "}
            {title}&rsquo;s read permissions instead of your own, and nothing can be changed.
          </p>
          <p className="mt-1 text-[11px] text-ink-400">
            Lists that narrow to one person narrow to you, so some of them will
            be empty — {article} {title} sees their own, and you are not one.
          </p>
        </div>
        <form action={endPreview}>
          <input
            type="hidden"
            name="back"
            value={PORTAL_HOME[ownRole] ?? "/"}
          />
          <button
            type="submit"
            className="rounded-lg border border-signal-amber/50 px-3 py-2 text-xs font-medium text-signal-amber transition hover:bg-signal-amber/20"
          >
            Leave preview
          </button>
        </form>
      </div>
    </div>
  );
}

import { api } from "@/lib/api";
import { ProfileForm } from "./profile-form";

interface Profile {
  name: string;
  email: string;
  organisation: string | null;
  jobTitle: string | null;
  country: string | null;
  phone: string | null;
  address: string | null;
  profileCompletedAt: string | null;
  profileRequired: boolean;
}

/**
 * Your profile.
 *
 * On first sign-in this is where a student, instructor or manager is held
 * until every field is filled in; the hold is the API's, and this screen is
 * one of the few it still answers. Afterwards it is where the profile is kept
 * up to date.
 */
export default async function ProfilePage() {
  const profile = await api<Profile>("/auth/profile");
  // The hold is the server's fact, not the query string's.
  const held = profile.profileRequired;

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Your account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 max-w-2xl text-xs text-ink-400">
          {profile.name} &middot; {profile.email}
        </p>
      </div>

      {held ? (
        <div
          role="alert"
          className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-4 py-3 text-sm text-signal-amber"
        >
          <p className="font-semibold">
            Complete your profile to open your courses.
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            Every field is required. Until they are all filled in, this is the
            only screen that answers — that is enforced on the server, not just
            here. It takes a minute, and you can change any of it later.
          </p>
        </div>
      ) : null}

      <ProfileForm
        required={held}
        initial={{
          organisation: profile.organisation,
          jobTitle: profile.jobTitle,
          country: profile.country,
          phone: profile.phone,
          address: profile.address,
        }}
      />
    </div>
  );
}

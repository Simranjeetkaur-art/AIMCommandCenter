import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, getSession } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { act } from "@/lib/act";

interface Programme {
  id: string;
  code: string;
  title: string;
  level: number;
  versions: Array<{ id: string; version: number; status: string }>;
}

interface ModuleRow {
  id: string;
  title: string;
  position: number;
}

interface BankRow {
  id: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
  _count: { questions: number };
  owner: { name: string };
  programme: { code: string; title: string } | null;
  module: { id: string; title: string; position: number } | null;
}

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{
    programmeId?: string;
    moduleId?: string;
    tag?: string;
    search?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const canWrite = session.permissions.includes(P.QUESTION_WRITE);
  const canDelete = session.permissions.includes(P.CONTENT_DELETE);

  const programmes = await api<Programme[]>("/academy/programmes");

  // Modules come from the draft version where there is one, because that is
  // the version an author is building against.
  const selected = programmes.find((p) => p.id === sp.programmeId);
  const workingVersion =
    selected?.versions.find((v) => v.status === "DRAFT") ??
    selected?.versions.find((v) => v.status === "PUBLISHED") ??
    null;

  const modules = workingVersion
    ? (
        await api<{ modules: ModuleRow[] }>(
          `/academy/versions/${workingVersion.id}/authoring`,
        )
      ).modules
    : [];

  const query = new URLSearchParams();
  if (sp.programmeId) query.set("programmeId", sp.programmeId);
  if (sp.moduleId) query.set("moduleId", sp.moduleId);
  if (sp.tag) query.set("tag", sp.tag);
  if (sp.search) query.set("search", sp.search);

  const { banks, tags } = await api<{ banks: BankRow[]; tags: string[] }>(
    `/academy/banks${query.toString() ? `?${query}` : ""}`,
  );

  const here = `/authoring/banks${query.toString() ? `?${query}` : ""}`;

  async function createBank(formData: FormData) {
    "use server";
    const programmeId = String(formData.get("programmeId") ?? "");
    const moduleId = String(formData.get("moduleId") ?? "");
    await act("/academy/banks", {
      method: "POST",
      body: {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        ...(programmeId ? { programmeId } : {}),
        ...(moduleId ? { moduleId } : {}),
        tags: String(formData.get("tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
    });
    revalidatePath("/authoring/banks");
  }

  async function removeBank(formData: FormData) {
    "use server";
    await act(`/academy/banks/${String(formData.get("bankId"))}`, {
      method: "DELETE",
    });
    revalidatePath("/authoring/banks");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">AIM&trade; Academy &middot; step 2</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Question banks
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-400">
            Where questions live before a paper asks for them. A bank belongs to
            a track and a module, so the assessment builder can offer the right
            ones instead of all of them.
          </p>
        </div>
        <Link href="/authoring" className={buttonClass("secondary", "md")}>
          Back to tracks
        </Link>
      </div>

      <Panel
        title="Find a bank"
        hint="Narrow by track, then by module, then by tag."
      >
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="rule-label mb-1 block">Track</label>
            <select
              name="programmeId"
              defaultValue={sp.programmeId ?? ""}
              className={FIELD}
            >
              <option value="">Any track</option>
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} &mdash; {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rule-label mb-1 block">Module</label>
            <select
              name="moduleId"
              defaultValue={sp.moduleId ?? ""}
              className={FIELD}
            >
              <option value="">
                {modules.length ? "Any module" : "Choose a track first"}
              </option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.position}. {m.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rule-label mb-1 block">Tag</label>
            <select name="tag" defaultValue={sp.tag ?? ""} className={FIELD}>
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-40 flex-1">
            <label className="rule-label mb-1 block">Title contains</label>
            <input
              name="search"
              defaultValue={sp.search ?? ""}
              className={`${FIELD} w-full`}
            />
          </div>
          <button type="submit" className={buttonClass("secondary", "md")}>
            Filter
          </button>
          <Link
            href="/authoring/banks"
            className={buttonClass("secondary", "md")}
          >
            Clear
          </Link>
        </form>
      </Panel>

      {canWrite ? (
        <Panel
          title="New bank"
          hint="Leave the track or module blank for a bank shared across them."
        >
          <form action={createBank} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="rule-label mb-1 block">Title</label>
              <input
                name="title"
                required
                minLength={3}
                className={`${FIELD} w-full`}
              />
            </div>
            <div>
              <label className="rule-label mb-1 block">Track</label>
              <select
                name="programmeId"
                defaultValue={sp.programmeId ?? ""}
                className={FIELD}
              >
                <option value="">Shared</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rule-label mb-1 block">Module</label>
              <select
                name="moduleId"
                defaultValue={sp.moduleId ?? ""}
                className={FIELD}
              >
                <option value="">Whole track</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.position}. {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-40 flex-1">
              <label className="rule-label mb-1 block">
                Tags{" "}
                <span className="text-ink-500">&mdash; comma separated</span>
              </label>
              <input
                name="tags"
                placeholder="authority, delegation"
                className={`${FIELD} w-full`}
              />
            </div>
            <div className="min-w-56 flex-1">
              <label className="rule-label mb-1 block">
                Description{" "}
                <span className="text-ink-500">&mdash; optional</span>
              </label>
              <input name="description" className={`${FIELD} w-full`} />
            </div>
            <button type="submit" className={buttonClass("secondary", "md")}>
              Create bank
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel
        title={`${banks.length} bank${banks.length === 1 ? "" : "s"}`}
        hint="Open one to add, edit and tag its questions."
      >
        {banks.length === 0 ? (
          <Empty>No bank matches that. Create one above.</Empty>
        ) : (
          <ul className="space-y-2">
            {banks.map((bank) => (
              <li
                key={bank.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <Link
                    href={`/authoring/banks/${bank.id}`}
                    className="text-sm font-medium hover:text-brass-500"
                  >
                    {bank.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {bank.programme ? (
                      <span className="font-mono text-[11px] text-brass-500">
                        {bank.programme.code}
                      </span>
                    ) : (
                      <Badge>shared</Badge>
                    )}
                    {bank.module ? (
                      <span className="text-[11px] text-ink-400">
                        module {bank.module.position} &middot;{" "}
                        {bank.module.title}
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-500">
                        whole track
                      </span>
                    )}
                    {bank.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-ink-800 px-1.5 py-0.5 text-[11px] text-ink-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {bank.description ? (
                    <p className="mt-1 text-xs text-ink-400">
                      {bank.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{bank._count.questions} questions</Badge>
                  <Link
                    href={`/authoring/banks/${bank.id}`}
                    className={buttonClass("secondary", "md")}
                  >
                    Open
                  </Link>
                  {canDelete ? (
                    <form action={removeBank}>
                      <input type="hidden" name="bankId" value={bank.id} />
                      <ConfirmButton
                        type="submit"
                        confirm={`Delete the bank "${bank.title}" and its ${bank._count.questions} question(s)? This cannot be undone.`}
                      >
                        Delete
                      </ConfirmButton>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

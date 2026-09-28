import { revalidatePath } from "next/cache";
import { Badge, Empty, Panel, buttonClass, statusTone } from "@/components/ui";
import { api } from "@/lib/api";
import { act } from "@/lib/act";

interface Programme {
  id: string;
  code: string;
  title: string;
  summary: string;
  status: string;
  versions: Array<{
    id: string;
    version: number;
    status: string;
    publishedAt: string | null;
    requirements: Record<string, unknown>;
  }>;
}

export default async function ProgrammesPage() {
  const programmes = await api<Programme[]>("/academy/programmes");

  async function createProgramme(formData: FormData) {
    "use server";
    await act("/academy/programmes", {
      method: "POST",
      body: {
        code: String(formData.get("code") ?? ""),
        title: String(formData.get("title") ?? ""),
        summary: String(formData.get("summary") ?? ""),
      },
    });
    revalidatePath("/manager/programmes");
  }

  return (
    <div className="space-y-6">
      <Panel
        title="New programme"
        hint="Created as a draft at version 1. Publishing it is an administration act, not a manager one."
      >
        <form
          action={createProgramme}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="rule-label mb-1 block">Code</label>
            <input
              name="code"
              required
              minLength={3}
              placeholder="ACA201"
              className="w-32 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="rule-label mb-1 block">Title</label>
            <input
              name="title"
              required
              minLength={3}
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="rule-label mb-1 block">Summary</label>
            <input
              name="summary"
              required
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
            />
          </div>
          <button type="submit" className={buttonClass("primary", "md")}>
            Create
          </button>
        </form>
      </Panel>

      <Panel title="Programmes">
        {programmes.length === 0 ? (
          <Empty>No programmes yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {programmes.map((programme) => (
              <li
                key={programme.id}
                className="rounded-lg border border-ink-800 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-brass-500">
                      {programme.code}
                    </span>
                    <span className="ml-2 text-sm font-medium">
                      {programme.title}
                    </span>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {programme.summary}
                    </p>
                  </div>
                  <Badge tone={statusTone(programme.status)}>
                    {programme.status}
                  </Badge>
                </div>

                <ul className="mt-3 flex flex-wrap gap-2">
                  {programme.versions.map((version) => (
                    <li
                      key={version.id}
                      className="rounded-lg border border-ink-800 px-3 py-1.5 text-xs"
                    >
                      <span className="font-mono">v{version.version}</span>
                      <span className="ml-2">
                        <Badge
                          tone={
                            version.status === "PUBLISHED" ? "green" : "neutral"
                          }
                        >
                          {version.status}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

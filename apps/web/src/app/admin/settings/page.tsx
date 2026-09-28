import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { act } from "@/lib/act";

interface Setting {
  key: string;
  value: unknown;
  description: string;
  updatedAt: string;
}

interface Flag {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string;
}

export default async function SettingsPage() {
  const [settings, flags] = await Promise.all([
    api<Setting[]>("/settings"),
    api<Flag[]>("/settings/flags"),
  ]);

  async function saveSetting(formData: FormData) {
    "use server";
    const raw = String(formData.get("value") ?? "");
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A bare string is a perfectly good setting value.
    }
    await act("/settings", {
      method: "PUT",
      body: { key: String(formData.get("key")), value: parsed },
    });
    revalidatePath("/admin/settings");
  }

  async function toggleFlag(formData: FormData) {
    "use server";
    await act("/settings/flags", {
      method: "PUT",
      body: {
        key: String(formData.get("key")),
        enabled: formData.get("enabled") === "true",
      },
    });
    revalidatePath("/admin/settings");
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Portal and branding settings"
        hint="A manager may read these. Only administration changes one, and every change is recorded."
      >
        {settings.length === 0 ? (
          <Empty>No settings configured.</Empty>
        ) : (
          <ul className="space-y-2">
            {settings.map((setting) => (
              <li
                key={setting.key}
                className="rounded-lg border border-ink-800 p-3"
              >
                <p className="font-mono text-xs text-brass-500">
                  {setting.key}
                </p>
                {setting.description ? (
                  <p className="mt-0.5 text-xs text-ink-400">
                    {setting.description}
                  </p>
                ) : null}
                <form
                  action={saveSetting}
                  className="mt-2 flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="key" value={setting.key} />
                  <input
                    name="value"
                    defaultValue={JSON.stringify(setting.value)}
                    className="flex-1 min-w-56 rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 font-mono text-xs"
                  />
                  <button
                    type="submit"
                    className={buttonClass("secondary", "md")}
                  >
                    Save
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Feature flags">
        {flags.length === 0 ? (
          <Empty>No flags configured.</Empty>
        ) : (
          <ul className="space-y-2">
            {flags.map((flag) => (
              <li
                key={flag.key}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 p-3"
              >
                <div>
                  <p className="font-mono text-xs text-brass-500">{flag.key}</p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {flag.description}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={flag.enabled ? "green" : "neutral"}>
                    {flag.enabled ? "On" : "Off"}
                  </Badge>
                  <form action={toggleFlag}>
                    <input type="hidden" name="key" value={flag.key} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={String(!flag.enabled)}
                    />
                    <button
                      type="submit"
                      className={buttonClass("secondary", "md")}
                    >
                      Turn {flag.enabled ? "off" : "on"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

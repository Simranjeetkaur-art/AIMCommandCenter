import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PERMISSIONS as P } from "@aim/contracts";
import { ApiError, api } from "@/lib/api";
import { requirePermission } from "@/lib/portal";
import { Badge, Panel } from "@/components/ui";
import type { CertificateTemplate } from "@/components/certificate";
import { CertificateDesigner } from "./designer";

interface TemplateScope {
  scope: string;
  programmeId: string | null;
  hasOwn: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  template: CertificateTemplate;
}

interface TemplateIndex {
  house: { hasOwn: boolean; updatedAt: string | null };
  programmes: Array<{
    id: string;
    code: string;
    title: string;
    level: number;
    hasOwnTemplate: boolean;
    updatedAt: string | null;
  }>;
}

type SaveResult = { ok: true } | { ok: false; error: string };

/** The design fields only. `source` is an answer, not an instruction. */
const DESIGN_FIELDS = [
  "institutionName",
  "title",
  "subtitle",
  "statement",
  "scopeNote",
  "signatoryName",
  "signatoryTitle",
  "signatureSvg",
  "sealSvg",
  "logoSvg",
  "footnote",
  "accentColor",
  "orientation",
] as const;

export default async function CertificateDesignerPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const sp = await searchParams;
  await requirePermission(P.CERTIFICATE_TEMPLATE_WRITE);

  const scope = sp.scope ?? "default";

  const [index, current] = await Promise.all([
    api<TemplateIndex>("/certificate-templates"),
    api<TemplateScope>(`/certificate-templates/${scope}`),
  ]);

  const programme = index.programmes.find((p) => p.id === scope) ?? null;
  const scopeLabel = programme
    ? `${programme.code} ${programme.title}`
    : "The house design";

  async function save(template: CertificateTemplate): Promise<SaveResult> {
    "use server";
    const body: Record<string, unknown> = {};
    for (const key of DESIGN_FIELDS) body[key] = template[key];

    try {
      await api(`/certificate-templates/${scope}`, { method: "PUT", body });
      revalidatePath("/authoring/certificates");
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof ApiError
            ? error.message
            : "The design could not be saved.",
      };
    }
  }

  async function reset(): Promise<SaveResult> {
    "use server";
    try {
      await api(`/certificate-templates/${scope}`, { method: "DELETE" });
      revalidatePath("/authoring/certificates");
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof ApiError
            ? error.message
            : "That design could not be reset.",
      };
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Authoring</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Certificate designer
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          What a certificate says, who signs it and what it carries. A track
          without a design of its own inherits the house one, so every
          credential prints — and the preview here is the same sheet the
          candidate is shown.
        </p>
      </div>

      <Panel
        title="Which certificate"
        hint="The house design is the fallback. A track only needs its own if it should differ."
      >
        <div className="flex flex-wrap gap-2">
          <ScopeLink
            href="/authoring/certificates"
            active={scope === "default"}
            label="House design"
            note={index.house.hasOwn ? "designed" : "built-in"}
          />
          {index.programmes.map((p) => (
            <ScopeLink
              key={p.id}
              href={`/authoring/certificates?scope=${p.id}`}
              active={scope === p.id}
              label={p.code}
              note={p.hasOwnTemplate ? "own design" : "inherits"}
            />
          ))}
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">{scopeLabel}</h2>
        <Badge tone={current.hasOwn ? "green" : "neutral"}>
          {current.hasOwn
            ? "Own design"
            : `Inherited · ${current.template.source}`}
        </Badge>
        {current.updatedBy ? (
          <span className="text-xs text-ink-500">
            Last saved by {current.updatedBy}
            {current.updatedAt
              ? ` on ${new Date(current.updatedAt).toLocaleDateString()}`
              : ""}
          </span>
        ) : null}
      </div>

      <CertificateDesigner
        key={scope}
        scopeLabel={scopeLabel}
        initial={current.template}
        hasOwn={current.hasOwn}
        canReset={scope !== "default"}
        save={save}
        reset={reset}
      />

      <Link
        href="/authoring"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to authoring
      </Link>
    </div>
  );
}

function ScopeLink({
  href,
  active,
  label,
  note,
}: {
  href: string;
  active: boolean;
  label: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-1.5 text-xs transition ${
        active
          ? "border-brass-500 text-brass-500"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:text-ink-100"
      }`}
    >
      <span className="font-mono">{label}</span>
      <span className="ml-2 text-[10px] uppercase tracking-wide text-ink-500">
        {note}
      </span>
    </Link>
  );
}

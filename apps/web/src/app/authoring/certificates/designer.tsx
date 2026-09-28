"use client";

import { useState, useTransition } from "react";
import {
  Certificate,
  SAMPLE_CERTIFICATE,
  type CertificateTemplate,
} from "@/components/certificate";
import { Button, FIELD, Panel } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * The certificate designer.
 *
 * The preview is the same `Certificate` the candidate's page renders, fed from
 * the form state, so what is on the right is what will be issued — with one
 * honest exception, stated on screen: artwork is sanitised by the server on
 * save, so a pasted SVG may come back simpler than it went in.
 */
export function CertificateDesigner({
  scopeLabel,
  initial,
  hasOwn,
  canReset,
  save,
  reset,
}: {
  scopeLabel: string;
  initial: CertificateTemplate;
  hasOwn: boolean;
  canReset: boolean;
  save: (template: CertificateTemplate) => Promise<SaveResult>;
  reset: () => Promise<SaveResult>;
}) {
  const [template, setTemplate] = useState<CertificateTemplate>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof CertificateTemplate>(
    key: K,
    value: CertificateTemplate[K],
  ) {
    setSaved(false);
    setTemplate((current) => ({ ...current, [key]: value }));
  }

  async function onSvgFile(
    key: "signatureSvg" | "sealSvg" | "logoSvg",
    file: File | undefined,
  ) {
    if (!file) return;
    setError(null);

    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
      setError("Artwork must be an SVG file.");
      return;
    }
    if (file.size > 64 * 1024) {
      setError(
        "That file is over 64 KB. Certificate artwork should be simple.",
      );
      return;
    }

    const content = await file.text();
    if (!/<svg[\s>]/i.test(content)) {
      setError("That file does not contain an SVG element.");
      return;
    }
    set(key, content.trim());
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await save(template);
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  function onReset() {
    setError(null);
    startTransition(async () => {
      const result = await reset();
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-5">
        <Panel
          title="Wording"
          hint={
            hasOwn
              ? `This design belongs to ${scopeLabel}.`
              : `${scopeLabel} has no design of its own — these are inherited. Saving creates one.`
          }
        >
          <div className="space-y-3">
            <Field
              label="Institution"
              value={template.institutionName}
              onChange={(v) => set("institutionName", v)}
            />
            <Field
              label="Title"
              value={template.title}
              onChange={(v) => set("title", v)}
            />
            <Field
              label="Subtitle"
              value={template.subtitle}
              onChange={(v) => set("subtitle", v)}
            />
            <Field
              label="Statement"
              value={template.statement}
              onChange={(v) => set("statement", v)}
              hint="The line above the track name."
            />
            <Field
              label="Scope note"
              value={template.scopeNote}
              onChange={(v) => set("scopeNote", v)}
              hint="Printed under the track title — what this credential covers."
            />
            <Field
              label="Footnote"
              value={template.footnote}
              onChange={(v) => set("footnote", v)}
              hint="The small print at the foot of the sheet."
            />
          </div>
        </Panel>

        <Panel title="Signatory">
          <div className="space-y-3">
            <Field
              label="Name"
              value={template.signatoryName}
              onChange={(v) => set("signatoryName", v)}
            />
            <Field
              label="Title"
              value={template.signatoryTitle}
              onChange={(v) => set("signatoryTitle", v)}
            />
            <SvgField
              label="Signature"
              value={template.signatureSvg}
              onFile={(f) => onSvgFile("signatureSvg", f)}
              onClear={() => set("signatureSvg", null)}
            />
          </div>
        </Panel>

        <Panel
          title="Marks"
          hint="SVG only, under 64 KB. The server strips anything that could run."
        >
          <div className="space-y-3">
            <SvgField
              label="Seal"
              value={template.sealSvg}
              onFile={(f) => onSvgFile("sealSvg", f)}
              onClear={() => set("sealSvg", null)}
            />
            <SvgField
              label="Logo"
              value={template.logoSvg}
              onFile={(f) => onSvgFile("logoSvg", f)}
              onClear={() => set("logoSvg", null)}
            />
          </div>
        </Panel>

        <Panel title="Sheet">
          <div className="space-y-3">
            <div>
              <label className="rule-label mb-1 block">Orientation</label>
              <select
                value={template.orientation}
                onChange={(e) =>
                  set(
                    "orientation",
                    e.target.value as CertificateTemplate["orientation"],
                  )
                }
                className={`${FIELD} w-full`}
              >
                <option value="LANDSCAPE">Landscape</option>
                <option value="PORTRAIT">Portrait</option>
              </select>
            </div>
            <div>
              <label className="rule-label mb-1 block">Accent colour</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={template.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-ink-700 bg-ink-950/60"
                />
                <input
                  value={template.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  className={`${FIELD} w-28 font-mono`}
                />
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            onClick={onSave}
            disabled={pending}
          >
            {pending ? "Saving…" : "Save design"}
          </Button>
          {canReset && hasOwn ? (
            <Button variant="danger" onClick={onReset} disabled={pending}>
              Reset to the house design
            </Button>
          ) : null}
          {saved ? (
            <span className="text-xs text-signal-green">Saved.</span>
          ) : null}
        </div>

        {error ? (
          <p className="rounded-lg border border-signal-red/40 bg-signal-red/5 px-3 py-2 text-xs text-signal-red">
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-2 lg:sticky lg:top-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rule-label">
            Preview — sample holder, {template.orientation.toLowerCase()}
          </p>
          {/* Proof the paper, not just the screen. The print stylesheet puts
              the sheet on white and drops the portal around it, which is a
              different enough thing to be worth checking before issuing. */}
          <PrintButton label="Proof on paper" />
        </div>
        <Certificate template={template} data={SAMPLE_CERTIFICATE} />
        <p className="text-[11px] text-ink-500">
          Artwork is sanitised on save, so a pasted SVG may be stored simpler
          than it appears here. The saved design is what is issued.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="rule-label mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${FIELD} w-full`}
      />
      {hint ? <p className="mt-1 text-[11px] text-ink-500">{hint}</p> : null}
    </div>
  );
}

function SvgField({
  label,
  value,
  onFile,
  onClear,
}: {
  label: string;
  value: string | null;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="rule-label mb-1 block">{label}</label>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-16 items-center justify-center rounded border border-ink-800 bg-ink-950/60 [&_svg]:max-h-8 [&_svg]:max-w-14">
          {value ? (
            <div dangerouslySetInnerHTML={{ __html: value }} />
          ) : (
            <span className="text-[10px] text-ink-600">none</span>
          )}
        </div>
        <input
          type="file"
          accept=".svg,image/svg+xml"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="text-[11px] text-ink-400 file:mr-2 file:rounded file:border file:border-ink-700 file:bg-ink-800 file:px-2 file:py-1 file:text-[11px] file:text-ink-100"
        />
        {value ? (
          <Button variant="quiet" size="sm" type="button" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

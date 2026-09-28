/**
 * The certificate sheet.
 *
 * One component, rendered both by the candidate's page and by the designer's
 * preview, for the same reason `LessonView` is shared: a preview drawn by a
 * second implementation is a promise the real page is not obliged to keep.
 *
 * No hooks and no client directive, so it renders on the server for a real
 * credential and inside the designer's client form for a live one.
 */

export interface CertificateTemplate {
  institutionName: string;
  title: string;
  subtitle: string;
  statement: string;
  scopeNote: string;
  signatoryName: string;
  signatoryTitle: string;
  /** Sanitised on the way in by the same allow-list badge artwork uses. */
  signatureSvg: string | null;
  sealSvg: string | null;
  logoSvg: string | null;
  footnote: string;
  accentColor: string;
  orientation: "LANDSCAPE" | "PORTRAIT";
  source?: "PROGRAMME" | "DEFAULT" | "BUILT_IN";
}

export interface CertificateData {
  holder: string;
  programme: string;
  programmeCode: string;
  version: number;
  serial: string;
  issuedAt: string;
  issuedBy: string;
  status: string;
  gateOverrides?: Array<{
    gate: string;
    reason: string;
    waivedByName?: string;
  }>;
}

export function Certificate({
  template,
  data,
}: {
  template: CertificateTemplate;
  data: CertificateData;
}) {
  const accent = template.accentColor || "#B4752A";
  const portrait = template.orientation === "PORTRAIT";

  return (
    <article
      className={`certificate-sheet panel mx-auto w-full px-8 py-10 text-center sm:px-12 ${
        portrait ? "max-w-xl" : "max-w-3xl"
      }`}
      style={{ borderColor: `${accent}55` }}
    >
      {/* The page box follows the design rather than the printer's default.
          `@page` cannot be selected by class, so the rule has to be emitted
          with the sheet that needs it -- only one certificate is ever on
          screen at a time, so there is nothing for a second one to fight. */}
      <style>{`@page { size: ${portrait ? "A4 portrait" : "A4 landscape"}; margin: 14mm; }`}</style>
      {template.logoSvg ? (
        <div
          className="mx-auto mb-5 h-12 [&_svg]:mx-auto [&_svg]:h-full [&_svg]:w-auto"
          dangerouslySetInnerHTML={{ __html: template.logoSvg }}
        />
      ) : null}

      <p
        className="font-mono text-[11px] uppercase tracking-[0.3em]"
        style={{ color: accent }}
      >
        {template.institutionName}
      </p>

      <h1 className="mt-5 text-sm uppercase tracking-[0.25em] text-ink-300">
        {template.title}
      </h1>
      {template.subtitle ? (
        <p className="mt-1 text-xs text-ink-400">{template.subtitle}</p>
      ) : null}

      <div
        className="mx-auto mt-6 h-px w-24"
        style={{ backgroundColor: accent }}
      />

      <p
        className={`mt-6 font-semibold tracking-tight ${portrait ? "text-2xl" : "text-3xl"}`}
      >
        {data.holder}
      </p>

      <p className="mx-auto mt-4 max-w-lg text-sm text-ink-400">
        {template.statement}
      </p>

      <p className="mt-2 text-lg font-medium">{data.programme}</p>
      <p className="mt-1 font-mono text-xs" style={{ color: accent }}>
        {data.programmeCode} &middot; version {data.version}
      </p>
      {template.scopeNote ? (
        <p className="mx-auto mt-3 max-w-lg text-xs text-ink-400">
          {template.scopeNote}
        </p>
      ) : null}

      {data.gateOverrides && data.gateOverrides.length > 0 ? (
        <div className="mx-auto mt-8 max-w-lg rounded-lg border border-signal-amber/40 bg-signal-amber/5 p-4 text-left">
          <p className="rule-label text-signal-amber">
            Issued with requirements waived
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink-200">
            {data.gateOverrides.map((override) => (
              <li key={override.gate}>
                <span className="font-mono">{override.gate}</span> —{" "}
                {override.reason}
                {override.waivedByName ? ` (${override.waivedByName})` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Signature and seal sit on one line, each holding its half whether or
          not it has artwork, so adding a seal does not move the signature. */}
      <div className="mt-10 flex flex-wrap items-end justify-center gap-10">
        <div className="min-w-48">
          <div className="flex h-12 items-end justify-center [&_svg]:max-h-12 [&_svg]:w-auto">
            {template.signatureSvg ? (
              <div
                dangerouslySetInnerHTML={{ __html: template.signatureSvg }}
              />
            ) : null}
          </div>
          <div
            className="mt-1 h-px w-full"
            style={{ backgroundColor: `${accent}88` }}
          />
          <p className="mt-2 text-xs font-medium text-ink-200">
            {template.signatoryName || "—"}
          </p>
          {template.signatoryTitle ? (
            <p className="mt-0.5 text-[11px] text-ink-400">
              {template.signatoryTitle}
            </p>
          ) : null}
        </div>

        {template.sealSvg ? (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full border [&_svg]:h-14 [&_svg]:w-14"
            style={{ borderColor: `${accent}66` }}
            dangerouslySetInnerHTML={{ __html: template.sealSvg }}
          />
        ) : null}
      </div>

      <dl className="mt-10 flex flex-wrap justify-center gap-x-10 gap-y-3 border-t border-ink-800 pt-6 text-xs">
        <div>
          <dt className="rule-label">Serial</dt>
          <dd className="mt-0.5 font-mono" style={{ color: accent }}>
            {data.serial}
          </dd>
        </div>
        <div>
          <dt className="rule-label">Issued</dt>
          <dd className="mt-0.5">
            {new Date(data.issuedAt).toLocaleDateString()}
          </dd>
        </div>
        <div>
          <dt className="rule-label">Registrar</dt>
          <dd className="mt-0.5">{data.issuedBy}</dd>
        </div>
        <div>
          <dt className="rule-label">Standing</dt>
          <dd className="mt-0.5">{data.status}</dd>
        </div>
      </dl>

      {template.footnote ? (
        <p className="mx-auto mt-6 max-w-xl text-[11px] leading-relaxed text-ink-500">
          {template.footnote}
        </p>
      ) : null}
    </article>
  );
}

/**
 * Stand-in holder details for the designer.
 *
 * Deliberately not a real candidate: a preview that pulled somebody's name in
 * would put one person's record on a screen about layout.
 */
export const SAMPLE_CERTIFICATE: CertificateData = {
  holder: "Candidate Name",
  programme: "AI Command Practitioner",
  programmeCode: "AIM-CP",
  version: 1,
  serial: "AIM-CP-0000-SAMPLE",
  issuedAt: new Date().toISOString(),
  issuedBy: "Registrar",
  status: "ISSUED",
  gateOverrides: [],
};

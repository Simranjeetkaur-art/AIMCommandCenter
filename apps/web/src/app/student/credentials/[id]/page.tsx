import Link from "next/link";
import { api, apiOrNotFound } from "@/lib/api";
import {
  Certificate,
  type CertificateData,
  type CertificateTemplate,
} from "@/components/certificate";
import { PrintButton } from "@/components/print-button";

interface CertificatePayload extends CertificateData {
  /** Resolved by the server: this track's design, or the house one. */
  template: CertificateTemplate;
  reason: string;
  verifyPath: string;
}

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const certificate = await apiOrNotFound<CertificatePayload>(
    `/credentials/${id}/certificate`,
  );

  return (
    <div className="space-y-4">
      <Certificate template={certificate.template} data={certificate} />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <PrintButton />
        <p className="text-[11px] text-ink-500">
          Anyone can confirm this credential at{" "}
          <a
            href={certificate.verifyPath}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-brass-500 hover:underline"
          >
            {certificate.verifyPath}
          </a>
        </p>
      </div>

      <Link
        href="/student/credentials"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to credentials
      </Link>
    </div>
  );
}

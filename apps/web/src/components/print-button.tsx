"use client";

import { buttonClass } from "@/components/ui";

/**
 * Sends the certificate to paper, or to a PDF.
 *
 * There is no PDF library behind this and deliberately so. Every browser's
 * print dialog offers "Save as PDF", and it produces the file from the same
 * stylesheet the printer would use -- so the document somebody saves is the
 * document somebody prints, with no second renderer to disagree with the
 * first. A server-side renderer would be a second implementation of the
 * certificate, which is the thing the shared `Certificate` component exists
 * to prevent.
 *
 * The button sits outside the sheet, so the print rules hide it without it
 * having to know they exist.
 */
export function PrintButton({
  label = "Print or save as PDF",
}: {
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={buttonClass("secondary", "md")}
    >
      {label}
    </button>
  );
}

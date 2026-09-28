"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeMark } from "@/components/badge-mark";
import { buttonClass } from "@/components/ui";

const TONES = ["brass", "green", "amber", "red", "blue", "neutral"] as const;

/**
 * What the preview may draw of pasted artwork.
 *
 * The preview is live markup in the author's own page, so it gets the same
 * treatment the server gives artwork on save, in the browser: no script, no
 * foreignObject, no event handler, no reference that leaves the document.
 * Parsed as SVG (not HTML) so nothing runs while it is being inspected.
 */
function previewSafeSvg(markup: string): string {
  if (!markup.trim()) return "";
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const root = doc.documentElement;
  if (root.nodeName.toLowerCase() !== "svg") return "";
  root
    .querySelectorAll("script, foreignObject, iframe, object, embed, style")
    .forEach((node) => node.remove());
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const local = name.endsWith("href");
      if (
        name.startsWith("on") ||
        (local && !attr.value.trim().startsWith("#")) ||
        /javascript:|data:|url\(\s*['"]?(?!#)/i.test(attr.value)
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return new XMLSerializer().serializeToString(root);
}

/**
 * Badge artwork input.
 *
 * Takes an .svg file or pasted markup and shows it immediately at the size it
 * will appear. The preview is deliberately not a promise: the server sanitises
 * on save with an allow-list, so what is stored may be a subset of what was
 * pasted, and the saved badge is what the shelf shows.
 */
export function BadgeArtwork({
  defaultSvg = "",
  defaultText = "",
  defaultTone = "brass",
  title,
}: {
  defaultSvg?: string;
  defaultText?: string;
  defaultTone?: string;
  title?: string;
}) {
  const [svg, setSvg] = useState(defaultSvg);
  // Sanitised in an effect, so the server render and the first client render
  // agree (both empty) and nothing unsanitised is ever put in the page.
  const [preview, setPreview] = useState("");
  useEffect(() => setPreview(previewSafeSvg(svg)), [svg]);
  const [text, setText] = useState(defaultText);
  const [tone, setTone] = useState(defaultTone);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml") {
      setError("Badge artwork must be an SVG file.");
      return;
    }
    if (file.size > 64 * 1024) {
      setError(
        "That file is over 64 KB. Badge artwork should be a simple mark.",
      );
      return;
    }

    const content = await file.text();
    if (!/<svg[\s>]/i.test(content)) {
      setError("That file does not contain an SVG element.");
      return;
    }
    setSvg(content.trim());
  }

  return (
    <div className="rounded-lg border border-ink-800 p-3">
      <p className="rule-label mb-2">Badge artwork</p>

      <div className="flex flex-wrap items-start gap-4">
        <div className="text-center">
          <BadgeMark
            iconSvg={preview}
            iconText={text}
            tone={tone}
            size="lg"
            title={title}
          />
          <p className="mt-1.5 text-[11px] text-ink-400">Earned</p>
        </div>
        <div className="text-center">
          <BadgeMark
            iconSvg={preview}
            iconText={text}
            tone={tone}
            size="lg"
            held={false}
          />
          <p className="mt-1.5 text-[11px] text-ink-400">Not yet</p>
        </div>

        <div className="flex-1 min-w-56 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={buttonClass("secondary", "md")}
            >
              Upload SVG
            </button>
            {svg ? (
              <button
                type="button"
                onClick={() => {
                  setSvg("");
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className={buttonClass("secondary", "md")}
              >
                Remove
              </button>
            ) : null}
          </div>

          <label className="block">
            <span className="rule-label mb-1 block">Or paste the markup</span>
            <textarea
              name="iconSvg"
              rows={3}
              value={svg}
              onChange={(e) => setSvg(e.target.value)}
              placeholder='<svg viewBox="0 0 48 48">…</svg>'
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-[11px] outline-none focus:border-brass-500"
            />
          </label>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="rule-label mb-1 block">Fallback mark</span>
              <input
                name="iconText"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={4}
                placeholder="L1"
                className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </label>
            <label className="block">
              <span className="rule-label mb-1 block">Tone</span>
              <select
                name="tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs capitalize"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="text-xs text-signal-red">{error}</p> : null}
          <p className="text-[11px] text-ink-400">
            Artwork draws with <span className="font-mono">currentColor</span>,
            so one shape works in every tone. Script, event handlers and remote
            references are stripped on save.
          </p>
        </div>
      </div>
    </div>
  );
}

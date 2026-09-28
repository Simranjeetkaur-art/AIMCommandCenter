import { BadRequestException } from "@nestjs/common";

/**
 * Sanitises uploaded badge artwork.
 *
 * The SVG is rendered inline so it can inherit colour from the page, which
 * means it is markup running in our origin. An administrator is trusted, but
 * trusted is not the same as unchecked: artwork arrives from a designer, a
 * download, or a generator, and any of those can carry a script, a remote
 * reference, or an event handler that nobody meant to include.
 *
 * Allow-list, not block-list: anything not named here is removed, so a tag or
 * attribute invented after this was written is dropped rather than admitted.
 */
const ALLOWED_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
  "use",
  "symbol",
]);

const ALLOWED_ATTRS = new Set([
  "viewBox",
  "xmlns",
  "width",
  "height",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-opacity",
  "fill-opacity",
  "fill-rule",
  "clip-rule",
  "opacity",
  "d",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "transform",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "id",
  "class",
  "clip-path",
  "mask",
  "text-anchor",
  "font-size",
  "font-family",
  "font-weight",
  "dominant-baseline",
  "letter-spacing",
  "preserveAspectRatio",
]);

export const MAX_SVG_BYTES = 64 * 1024;

export function sanitiseBadgeSvg(input: string): string {
  const svg = input.trim();

  if (svg.length === 0) throw new BadRequestException("The artwork is empty");
  if (Buffer.byteLength(svg, "utf8") > MAX_SVG_BYTES) {
    throw new BadRequestException(
      `Badge artwork must be under ${MAX_SVG_BYTES / 1024} KB`,
    );
  }
  if (!/^<svg[\s>]/i.test(svg)) {
    throw new BadRequestException("Badge artwork must be an SVG element");
  }

  let out = svg;

  // Whole elements that can execute or fetch, removed with their contents.
  out = out.replace(
    /<(script|foreignObject|iframe|object|embed|animate|set|handler)\b[\s\S]*?<\/\1>/gi,
    "",
  );
  out = out.replace(
    /<(script|foreignObject|iframe|object|embed|animate|set|handler)\b[^>]*\/>/gi,
    "",
  );
  out = out.replace(/<!DOCTYPE[\s\S]*?>/gi, "");
  out = out.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, "");
  out = out.replace(/<\?[\s\S]*?\?>/g, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // Elements outside the allow-list lose their tags but keep their children,
  // so unknown wrappers do not silently delete the artwork inside them.
  out = out.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*)>/g,
    (whole, rawTag: string, attrs: string) => {
      const tag = rawTag.split(":").pop() as string;
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (whole.startsWith("</")) return `</${tag}>`;

      const kept: string[] = [];
      const attrPattern =
        /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*')/g;
      let match: RegExpExecArray | null;
      while ((match = attrPattern.exec(attrs)) !== null) {
        const name = match[1];
        const value = match[2].slice(1, -1);

        if (/^on/i.test(name)) continue;
        if (!ALLOWED_ATTRS.has(name)) continue;
        // No remote or executable references, however they are spelled.
        if (/(javascript:|data:text\/html|<|&#|expression\s*\()/i.test(value))
          continue;
        if (/^(href|xlink:href|src)$/i.test(name)) continue;

        kept.push(`${name}="${value.replace(/"/g, "&quot;")}"`);
      }

      const selfClosing = whole.trimEnd().endsWith("/>") ? " /" : "";
      return `<${tag}${kept.length ? " " + kept.join(" ") : ""}${selfClosing}>`;
    },
  );

  if (!/<svg\b/i.test(out)) {
    throw new BadRequestException(
      "Nothing renderable survived sanitising that artwork",
    );
  }

  return out.trim();
}

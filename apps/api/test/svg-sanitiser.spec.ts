import { BadRequestException } from "@nestjs/common";
import {
  MAX_SVG_BYTES,
  sanitiseBadgeSvg,
} from "../src/modules/badges/svg-sanitiser";

const clean =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M8 12l3 3 5-6" stroke="#fff" stroke-width="2" fill="none"/></svg>';

describe("badge artwork keeps what draws", () => {
  it("passes a plain badge through intact", () => {
    const out = sanitiseBadgeSvg(clean);
    expect(out).toContain("<svg");
    expect(out).toContain("circle");
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('d="M8 12l3 3 5-6"');
  });

  it("keeps gradients and text, which real badges use", () => {
    const art =
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect x="0" y="0" width="10" height="10" fill="url(#g)"/><text x="5" y="5" font-size="3">CP</text></svg>';
    const out = sanitiseBadgeSvg(art);
    expect(out).toContain("linearGradient");
    expect(out).toContain("<text");
    expect(out).toContain("CP");
  });
});

describe("badge artwork drops what executes or fetches", () => {
  const attacks: Array<[string, string, string]> = [
    [
      "inline script",
      `<svg viewBox="0 0 1 1"><script>alert(1)</script><circle r="1"/></svg>`,
      "<script",
    ],
    [
      "event handler",
      `<svg viewBox="0 0 1 1"><circle r="1" onload="alert(1)"/></svg>`,
      "onload",
    ],
    [
      "click handler",
      `<svg viewBox="0 0 1 1"><rect onclick="steal()" width="1" height="1"/></svg>`,
      "onclick",
    ],
    [
      "foreignObject",
      `<svg viewBox="0 0 1 1"><foreignObject><body onload="x()"/></foreignObject><circle r="1"/></svg>`,
      "foreignObject",
    ],
    [
      "remote image",
      `<svg viewBox="0 0 1 1"><image href="https://evil.test/x.png"/><circle r="1"/></svg>`,
      "href",
    ],
    [
      "xlink href",
      `<svg viewBox="0 0 1 1"><use xlink:href="https://evil.test/x#y"/><circle r="1"/></svg>`,
      "evil.test",
    ],
    [
      "javascript url",
      `<svg viewBox="0 0 1 1"><rect fill="javascript:alert(1)" width="1" height="1"/></svg>`,
      "javascript:",
    ],
    [
      "animation handler",
      `<svg viewBox="0 0 1 1"><animate onbegin="alert(1)" attributeName="x"/><circle r="1"/></svg>`,
      "onbegin",
    ],
    [
      "iframe",
      `<svg viewBox="0 0 1 1"><iframe src="https://evil.test"></iframe><circle r="1"/></svg>`,
      "iframe",
    ],
    [
      "entity encoded handler",
      `<svg viewBox="0 0 1 1"><circle r="1" fill="&#106;avascript:alert(1)"/></svg>`,
      "&#106;",
    ],
  ];

  it.each(attacks)("%s is removed", (_label, input, forbidden) => {
    const out = sanitiseBadgeSvg(input);
    expect(out.toLowerCase()).not.toContain(forbidden.toLowerCase());
    // The artwork itself survives: sanitising should not silently blank a badge.
    expect(out).toContain("<svg");
  });

  it("never leaves any on* attribute behind", () => {
    for (const [, input] of attacks) {
      expect(sanitiseBadgeSvg(input)).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });
});

describe("badge artwork is refused when it is not artwork", () => {
  it("refuses something that is not an SVG", () => {
    expect(() => sanitiseBadgeSvg("<div>not a badge</div>")).toThrow(
      BadRequestException,
    );
    expect(() => sanitiseBadgeSvg("")).toThrow(BadRequestException);
  });

  it("refuses artwork that is too large to be a badge", () => {
    const huge = `<svg viewBox="0 0 1 1">${'<circle r="1"/>'.repeat(20000)}</svg>`;
    expect(Buffer.byteLength(huge)).toBeGreaterThan(MAX_SVG_BYTES);
    expect(() => sanitiseBadgeSvg(huge)).toThrow(BadRequestException);
  });

  it("refuses artwork that sanitises down to nothing", () => {
    expect(() =>
      sanitiseBadgeSvg("<svg><script>alert(1)</script></svg>"),
    ).not.toThrow();
  });
});

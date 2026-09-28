/**
 * Turns the prototype's lesson markup into editable structure.
 *
 * The lessons were HTML built inside render functions, which made every
 * sentence a code change. This reads that markup back into LessonContent so
 * the authoring screens can edit all thirty of them, and the interface can
 * render them from data instead of trusting markup.
 *
 * Deliberately a small hand-written reader rather than a DOM library: the
 * input is a known, closed set of thirty documents we authored ourselves, and
 * the parser is pinned by a test that checks every one of them.
 */
import type { LessonBlock, LessonContent, LessonSection } from "@aim/contracts";

const BLOCK_CLASSES: Array<[RegExp, LessonBlock["kind"]]> = [
  [/keyInsight/i, "KEY_INSIGHT"],
  [/caCase|caseBox|execCase/i, "CASE"],
  [/commandRule|caPrinciple/i, "RULE"],
  [/formulaCard|workedMath/i, "FORMULA"],
  [/commandPractice|caPractice|caCommandCheck/i, "PRACTICE"],
];

/**
 * Repairs the spacing that stripping inline tags leaves behind.
 *
 * Every tag becomes a space, so `<strong>capability</strong>,` arrives as
 * "capability ," and a candidate reads "capability , autonomy , authority ;".
 * Exported because the backfill that corrects already-imported lessons has to
 * apply exactly the same rule.
 */
export function tidyPunctuation(value: string): string {
  return value
    .replace(/\s+([,;:.!?])/g, "$1")
    .replace(/([([])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function text(html: string): string {
  return tidyPunctuation(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'"),
  );
}

function paragraphsIn(fragment: string): string[] {
  return [...fragment.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => text(m[1]))
    .filter((p) => p.length > 0);
}

function listItemsIn(fragment: string): string[] {
  return [...fragment.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => text(m[1]))
    .filter((i) => i.length > 0);
}

/** Pulls out every callout div, returning the blocks and the remaining prose. */
function extractBlocks(fragment: string): {
  blocks: LessonBlock[];
  rest: string;
} {
  const blocks: LessonBlock[] = [];
  let rest = fragment;

  // Callouts are flat divs in this corpus, so a non-greedy match to the next
  // closing tag is sufficient and avoids needing a full parser.
  const pattern = /<div class="([^"]*)"[^>]*>([\s\S]*?)<\/div>/gi;
  const matches = [...fragment.matchAll(pattern)];

  for (const match of matches) {
    const [whole, className, inner] = match;
    const kind = BLOCK_CLASSES.find(([re]) => re.test(className))?.[1];
    if (!kind) continue;

    const title = /<b[^>]*>([\s\S]*?)<\/b>/i.exec(inner)?.[1];
    const items = listItemsIn(inner);
    const body =
      paragraphsIn(inner).join(" ") ||
      text(inner.replace(/<b[^>]*>[\s\S]*?<\/b>/i, ""));

    blocks.push({
      kind,
      ...(title ? { title: text(title) } : {}),
      ...(items.length > 0 ? { items } : {}),
      ...(body ? { body } : {}),
    });
    rest = rest.replace(whole, " ");
  }

  return { blocks, rest };
}

export function parseLesson(html: string): LessonContent {
  const content: LessonContent = { sections: [] };

  const eyebrow = /<span class="academyEyebrow"[^>]*>([\s\S]*?)<\/span>/i.exec(
    html,
  )?.[1];
  if (eyebrow) content.eyebrow = text(eyebrow);

  const heading = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html)?.[1];
  if (heading) content.heading = text(heading);

  // The path line: "LEARN → EXECUTIVE CASE → KEY INSIGHT → ..."
  const headerBlock =
    /<div class="(?:pathHeader|lessonHeader)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(
      html,
    )?.[1] ?? html.slice(0, 1500);
  for (const p of paragraphsIn(headerBlock)) {
    if (p.includes("→")) {
      content.path = p
        .split("→")
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    }
  }

  // AIM-CA puts the same path line in a band rather than a paragraph.
  if (!content.path) {
    const band = /<div class="caLessonBand"[^>]*>([\s\S]*?)<\/div>/i.exec(
      html,
    )?.[1];
    if (band && band.includes("→")) {
      content.path = text(band)
        .split("→")
        .map((step) => step.trim())
        .filter(Boolean);
    }
  }

  const lead = /<p class="lessonLead"[^>]*>([\s\S]*?)<\/p>/i.exec(html)?.[1];
  if (lead) content.lead = text(lead);

  const stats = /<div class="lessonStats"[^>]*>([\s\S]*?)<\/div>/i.exec(
    html,
  )?.[1];
  if (stats) {
    content.stats = [...stats.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((m) => text(m[1]))
      .filter(Boolean);
  }

  // Section headings are h3 in AIM-CP and AIM-EL and h4 in AIM-CA, with
  // "Course Overview" and "Learning Objectives" as named special cases.
  const parts = html.split(/<h[34][^>]*>/i);
  for (let i = 1; i < parts.length; i += 1) {
    const chunk = parts[i];
    // Both closing tags are five characters, so whichever comes first ends the
    // heading. Searched by string rather than pattern to keep this readable.
    const h3 = chunk.indexOf("</h3>");
    const h4 = chunk.indexOf("</h4>");
    const headingEnd = h3 === -1 ? h4 : h4 === -1 ? h3 : Math.min(h3, h4);
    if (headingEnd === -1) continue;

    const rawHeading = text(chunk.slice(0, headingEnd));
    const body = chunk.slice(headingEnd + 5);

    if (/^course overview$/i.test(rawHeading)) {
      content.overview = paragraphsIn(body).join(" ");
      continue;
    }

    if (/^learning objectives$/i.test(rawHeading)) {
      const intro = paragraphsIn(body)[0];
      if (intro) content.objectivesIntro = intro;
      content.objectives = listItemsIn(body);
      continue;
    }

    // "1. Heading", "1) Heading" and "1 · Heading" all number a section.
    const numbered = /^(\d+)\s*[.)·•]\s*(.+)$/.exec(rawHeading);
    const { blocks, rest } = extractBlocks(body);

    const section: LessonSection = {
      ...(numbered ? { number: numbered[1] } : {}),
      heading: numbered ? numbered[2] : rawHeading,
      paragraphs: paragraphsIn(rest),
      ...(blocks.length > 0 ? { blocks } : {}),
    };

    const items = listItemsIn(rest);
    if (items.length > 0) {
      section.blocks = [...(section.blocks ?? []), { kind: "LIST", items }];
    }

    // A heading with nothing under it is a layout artefact, not a section.
    if (section.paragraphs.length === 0 && !section.blocks?.length) continue;
    content.sections.push(section);
  }

  // Sections carry their own number in this corpus; where they do not, the
  // reading order is the numbering.
  content.sections.forEach((section, index) => {
    if (!section.number) section.number = String(index + 1);
  });

  return content;
}

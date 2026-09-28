/**
 * A pasted block of multiple-choice questions, read into questions.
 *
 * The format is the one an author already writes by hand: the question on its
 * own line, its choices under it, an asterisk against the right one, a blank
 * line between questions.
 *
 *     Which control bounds an agent's authority?
 *     *An envelope
 *     A system prompt
 *     A rate limit
 *
 * Nothing here escapes or quotes, which is the point of choosing it: a stem
 * may contain commas, quotes and colons without ceremony. A choice that
 * genuinely begins with an asterisk is written `\*`.
 *
 * Every fault is collected rather than thrown on the first one. Somebody who
 * has pasted forty questions wants the list of what is wrong, not the first
 * line of it, and the caller refuses the whole batch either way.
 */

export interface ParsedQuestion {
  stem: string;
  choices: string[];
  correctIndex: number;
}

export interface ParsedQuestions {
  questions: ParsedQuestion[];
  errors: string[];
}

/** The most a single batch may carry. Matches the API's own ceiling. */
export const MAX_BULK_QUESTIONS = 200;

const MIN_STEM = 5;
const MIN_CHOICES = 2;
const MAX_CHOICES = 8;

export function parseQuestionBlock(text: string): ParsedQuestions {
  // Blocks are separated by one or more blank lines. \r\n first, so a paste
  // out of Windows or a Word document does not arrive with stray returns
  // glued to the end of every choice.
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);

  const questions: ParsedQuestion[] = [];
  const errors: string[] = [];

  if (blocks.length === 0) {
    return { questions, errors: ["There is nothing to add"] };
  }
  if (blocks.length > MAX_BULK_QUESTIONS) {
    return {
      questions,
      errors: [
        `${blocks.length} questions in one paste — ${MAX_BULK_QUESTIONS} is the limit`,
      ],
    };
  }

  blocks.forEach((lines, index) => {
    const at = `Question ${index + 1}`;
    const [stem, ...rawChoices] = lines;

    if (stem.length < MIN_STEM) {
      errors.push(`${at}: the question itself is too short to be one`);
      return;
    }
    if (rawChoices.length < MIN_CHOICES) {
      errors.push(
        `${at}: needs at least ${MIN_CHOICES} choices, on their own lines under it`,
      );
      return;
    }
    if (rawChoices.length > MAX_CHOICES) {
      errors.push(`${at}: ${rawChoices.length} choices, and ${MAX_CHOICES} is the most`);
      return;
    }

    // An author who wants a literal asterisk first writes \*. Unescaping runs
    // after the marker is stripped, so `*\*` is the choice "*", marked -- not
    // the choice "\*", which is what dropping the marker alone would leave.
    const unescape = (choice: string) =>
      choice.startsWith("\\*") ? choice.slice(1) : choice;

    const marked: number[] = [];
    const choices = rawChoices.map((line, i) => {
      if (line.startsWith("*")) {
        marked.push(i);
        return unescape(line.slice(1).trim());
      }
      return unescape(line);
    });

    if (marked.length === 0) {
      errors.push(`${at}: no correct answer — put a * against the right choice`);
      return;
    }
    if (marked.length > 1) {
      errors.push(
        `${at}: ${marked.length} choices are marked correct, and exactly one may be`,
      );
      return;
    }
    if (choices.some((c) => c.length === 0)) {
      errors.push(`${at}: one of its choices is empty`);
      return;
    }
    if (new Set(choices).size !== choices.length) {
      errors.push(`${at}: two of its choices are the same`);
      return;
    }

    questions.push({ stem, choices, correctIndex: marked[0] });
  });

  return { questions, errors };
}

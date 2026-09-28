import { IsString, MinLength } from "class-validator";

export class AnswerMissionDto {
  /**
   * Which mission is being answered.
   *
   * Sent explicitly rather than inferred from "wherever the run had got to",
   * so that a stale screen answering mission 12 cannot be applied to mission
   * 13 after the candidate opened the simulator in a second tab. The server
   * checks it against the mission actually in front of them and refuses a
   * mismatch instead of quietly recording an answer to a different scenario.
   */
  @IsString() @MinLength(1) questionId!: string;

  /** The id of the chosen option, not its position on the screen. */
  @IsString() @MinLength(1) optionId!: string;
}

export class AbandonRunDto {
  /**
   * Why the run is being ended early. Ending a run costs an attempt and marks
   * the unflown missions wrong, so it is a decision worth a sentence.
   */
  @IsString() @MinLength(4) reason!: string;
}

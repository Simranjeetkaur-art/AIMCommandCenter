import { IsEnum, IsString } from "class-validator";
import { LessonProgressStatus } from "@prisma/client";

export class SetProgressDto {
  @IsString() lessonId!: string;
  @IsEnum(LessonProgressStatus) status!: LessonProgressStatus;
}

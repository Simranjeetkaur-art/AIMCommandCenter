import { IsString, MaxLength, MinLength } from "class-validator";
import { MAX_MESSAGE_LENGTH } from "@aim/contracts";

export class SendMessageDto {
  @IsString() recipientId!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_MESSAGE_LENGTH)
  body!: string;
}

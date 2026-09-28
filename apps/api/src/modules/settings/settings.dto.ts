import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class UpsertSettingDto {
  @IsString() @MinLength(2) key!: string;
  value!: unknown;
  @IsOptional() @IsString() description?: string;
}

export class SetFlagDto {
  @IsString() @MinLength(2) key!: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() description?: string;
}

import {
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * What a certificate says, and who signs it.
 *
 * Every field is optional because the designer saves the whole form on each
 * edit and a template that has never been touched is a row of defaults, not an
 * absence. The three SVG fields accept null explicitly -- clearing a seal is a
 * thing an administrator does, and `undefined` would mean "leave it alone".
 */
export class UpdateCertificateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  institutionName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  statement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  scopeNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatoryTitle?: string;

  @IsOptional()
  @IsString()
  signatureSvg?: string | null;

  @IsOptional()
  @IsString()
  sealSvg?: string | null;

  @IsOptional()
  @IsString()
  logoSvg?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  footnote?: string;

  /** Drives the rule, the seal ring and the signature line on the printed sheet. */
  @IsOptional()
  @IsHexColor()
  accentColor?: string;

  @IsOptional()
  @IsIn(["LANDSCAPE", "PORTRAIT"])
  orientation?: "LANDSCAPE" | "PORTRAIT";
}

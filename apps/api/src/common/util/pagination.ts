import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.pageSize ?? 25);
  }

  get take(): number {
    return this.pageSize ?? 25;
  }
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function page<T>(items: T[], total: number, query: PageQuery): Page<T> {
  return {
    items,
    total,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 25,
  };
}

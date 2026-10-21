import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Model, FilterQuery } from 'mongoose';

export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export interface Page<T = any> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export async function paginate(
  model: Model<any>,
  filter: FilterQuery<any>,
  opts: { page: number; limit: number; sort?: Record<string, 1 | -1>; populate?: any; select?: string },
): Promise<Page<any>> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  let query = model
    .find(filter)
    .sort(opts.sort ?? { createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  if (opts.select) query = query.select(opts.select);
  if (opts.populate) query = query.populate(opts.populate);
  const [items, total] = await Promise.all([query.lean().exec(), model.countDocuments(filter).exec()]);
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Escape user input before using it in a RegExp (prevents ReDoS / regex injection). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

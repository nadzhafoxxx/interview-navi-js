import { Type } from "class-transformer";
import { IsInt, IsObject, IsOptional, Max, Min } from "class-validator";

/** Верхняя граница страницы виджета: запрос не может попросить больше. */
export const MAX_PAGE_SIZE = 100;

/**
 * Тело запроса рендера.
 * params — произвольный набор значений контролов: {"region": "MSK"}.
 * Ключи сравниваются со scode контролов.
 */
export class RenderDashboardDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  screen!: number;

  // Значения контролов приходят динамически: ограничиваем только типом
  // «объект со строковыми значениями», конкретные ключи знает граф.
  @IsOptional()
  @IsObject()
  params?: Record<string, string>;

  /** страница данных виджетов, с 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** размер страницы виджетов */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

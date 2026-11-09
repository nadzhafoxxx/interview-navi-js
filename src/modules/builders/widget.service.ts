import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DashboardRepository,
  type WidgetRow,
} from "../dashboard-repository/dashboard.repository";
import type { WidgetView } from "./widget.view";

export interface WidgetPagination {
  page: number;
  pageSize: number;
}

export interface BuildWidgetArgs {
  widget: WidgetRow;
  /** привязки виджета к контролам (ncontrolid), уже отсортированные по nord */
  controlIds: number[];
  /** вычисленные значения контролов по id контрола */
  valuesById: Record<number, string>;
  pagination: WidgetPagination;
}

/**
 * Вычисляет один виджет: подставляет значения контролов в SQL датасета
 * и отдаёт страницу строк.
 *
 * Про безопасность: ssql живёт в БД (его пишет разработчик дашборда),
 * а значения контролов приходят из запроса. Поэтому значения уходят
 * ИСКЛЮЧИТЕЛЬНО bind-параметрами — `?` в ssql, значение отдельным массивом.
 * Никакой склейки SQL со строками из запроса здесь быть не должно.
 */
@Injectable()
export class WidgetService {
  constructor(private readonly repository: DashboardRepository) {}

  public async buildWidget({
    widget,
    controlIds,
    valuesById,
    pagination,
  }: BuildWidgetArgs): Promise<WidgetView> {
    const bindValues = this.resolveBindValues(controlIds, valuesById, widget);
    const { page, pageSize } = pagination;
    const offset = (page - 1) * pageSize;

    // count и страница независимы — считаем параллельно
    const [total, rows] = await Promise.all([
      this.repository.getWidgetRowCount(widget.dataset_sql, bindValues),
      this.repository.getWidgetData(widget.dataset_sql, bindValues, {
        limit: pageSize,
        offset,
      }),
    ]);

    return {
      nWidgetID: widget.nid,
      sTitle: widget.stitle ?? undefined,
      nDatasetID: widget.ndatasetid,
      sDatasetTitle: widget.dataset_title,
      nOrd: widget.nord ?? 0,
      params: this.describeParams(controlIds, valuesById),
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      rows,
      pagination: { page, pageSize, total },
    };
  }

  /**
   * Значения контролов в порядке привязки (по nord).
   *
   * Если контрол не посчитан — это рассинхрон данных, а не повод молча
   * подставить пустую строку: иначе виджет вернёт пустую страницу
   * без объяснения причины.
   */
  private resolveBindValues(
    controlIds: number[],
    valuesById: Record<number, string>,
    widget: WidgetRow,
  ): (string | number)[] {
    return controlIds.map((controlId) => {
      const value = valuesById[controlId];

      if (value === undefined) {
        throw new BadRequestException(
          `Нет значения контрола ${controlId} для виджета ${widget.nid}`,
        );
      }

      return value;
    });
  }

  private describeParams(
    controlIds: number[],
    valuesById: Record<number, string>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const controlId of controlIds) {
      const value = valuesById[controlId];
      if (value !== undefined) {
        result[String(controlId)] = value;
      }
    }
    return result;
  }
}

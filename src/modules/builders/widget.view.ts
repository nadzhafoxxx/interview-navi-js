/**
 * Представление виджета в ответе ручки.
 */
export interface WidgetView {
  nWidgetID: number;
  sTitle?: string;
  nDatasetID: number;
  sDatasetTitle: string;
  nOrd: number;
  /** значения контролов, подставленные в SQL датасета */
  params: Record<string, string>;
  columns: string[];
  rows: Record<string, unknown>[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

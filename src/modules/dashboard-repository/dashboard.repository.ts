import { Injectable } from "@nestjs/common";
import { DuckDbService } from "../../database/duckdb.service";

/**
 * Все SQL проекта собраны здесь.
 * Типы строк объявлены рядом с запросами: репозиторий диктует типы
 * доменной логике, как в оригинальном dashboard-engine.
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly db: DuckDbService) {}

  /** Драйвер возвращает Record<string, unknown>; каст один и в одном месте. */
  private static asRows<T>(rows: unknown): T[] {
    return rows as T[];
  }

  public async getDashboard(dashboardId: number) {
    const rows = await this.db.query(
      `SELECT nid, stitle FROM dashboards WHERE nid = ?`,
      [dashboardId],
    );
    return DashboardRepository.asRows<DashboardRow>(rows)[0];
  }

  public async getScreens(dashboardId: number) {
    const rows = await this.db.query(
      `SELECT nid, ndashboardid, stitle, norder
         FROM screens
        WHERE ndashboardid = ?
        ORDER BY norder`,
      [dashboardId],
    );
    return DashboardRepository.asRows<ScreenRow>(rows);
  }

  public async getScreen(screenId: number) {
    const rows = await this.db.query(
      `SELECT nid, ndashboardid, stitle, norder
         FROM screens
        WHERE nid = ?`,
      [screenId],
    );
    return DashboardRepository.asRows<ScreenRow>(rows)[0];
  }

  /**
   * Контролы экрана. nparentcontrolid приводим к number | null,
   * не полагаясь на то, что вернёт драйвер.
   */
  public async getControls(screenId: number) {
    const rows = await this.db.query(
      `SELECT nid, nscreenid, scode, slabel, nviewtype, nord,
              nparentcontrolid, squery
         FROM controls
        WHERE nscreenid = ?
        ORDER BY nord`,
      [screenId],
    );

    return DashboardRepository.asRows<ControlRow>(rows).map((row) => ({
      ...row,
      nparentcontrolid:
        row.nparentcontrolid === null ? null : Number(row.nparentcontrolid),
    }));
  }

  public async getControlDefaults(controlIds: number[]) {
    if (controlIds.length === 0) {
      return [] as ControlDefaultRow[];
    }

    // Плейсхолдеры генерируются по длине массива, сами id уходят bind-ом.
    const placeholders = controlIds.map(() => "?").join(", ");
    const rows = await this.db.query(
      `SELECT ncontrolid, svalue
         FROM control_defaults
        WHERE ncontrolid IN (${placeholders})`,
      controlIds,
    );
    return DashboardRepository.asRows<ControlDefaultRow>(rows);
  }

  /** Строки источника контрола; параметры подставляются bind-ом. */
  public async getControlRows(query: string, params: (string | number)[]) {
    const rows = await this.db.query(query, params);
    return DashboardRepository.asRows<ControlRowItem>(rows);
  }

  /** Виджеты экрана с датасетами — одним запросом, без N+1. */
  public async getWidgets(screenId: number) {
    const rows = await this.db.query(
      `SELECT w.nid, w.nscreenid, w.ndatasetid, w.stitle, w.nord,
              d.stitle AS dataset_title, d.ssql AS dataset_sql
         FROM widgets w
         JOIN datasets d ON d.nid = w.ndatasetid
        WHERE w.nscreenid = ?
        ORDER BY w.nord`,
      [screenId],
    );
    // id сравниваются с ключами Map/объектов в коде — приводим к number
    // здесь, а не полагаемся на то, что драйвер не отдаст их строкой.
    return DashboardRepository.asRows<WidgetRow>(rows).map((row) => ({
      ...row,
      nid: Number(row.nid),
      nscreenid: Number(row.nscreenid),
      ndatasetid: Number(row.ndatasetid),
    }));
  }

  /** Привязки виджетов к контролам, в порядке nord — порядок bind-параметров. */
  public async getWidgetControls(widgetIds: number[]) {
    if (widgetIds.length === 0) {
      return [] as WidgetControlRow[];
    }

    const placeholders = widgetIds.map(() => "?").join(", ");
    const rows = await this.db.query(
      `SELECT wc.nwidgetid, wc.ncontrolid, wc.nord
         FROM widget_controls wc
        WHERE wc.nwidgetid IN (${placeholders})
        ORDER BY wc.nwidgetid, wc.nord`,
      widgetIds,
    );
    return DashboardRepository.asRows<WidgetControlRow>(rows).map((row) => ({
      ...row,
      nwidgetid: Number(row.nwidgetid),
      ncontrolid: Number(row.ncontrolid),
    }));
  }

  /**
   * Выполняет SQL датасета с пагинацией.
   *
   * Лимит накладывается снаружи: запрос из БД не может попросить больше
   * строк, чем разрешено конфигурацей контроллера. Тело запроса оборачивается
   * в подзапрос, поэтому работают и агрегаты, и ORDER BY внутри ssql.
   * Точка с запятой в конце отсекается — иначе тело не влезет в подзапрос.
   */
  public async getWidgetData(
    sql: string,
    params: (string | number)[],
    pagination: { limit: number; offset: number },
  ) {
    const rows = await this.db.query(
      `SELECT * FROM (${DashboardRepository.asSubquery(sql)}) AS dataset_rows LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset],
    );
    return DashboardRepository.asRows<Record<string, unknown>>(rows);
  }

  /** Общее число строк датасета — для постраничной навигации. */
  public async getWidgetRowCount(sql: string, params: (string | number)[]) {
    const rows = await this.db.query(
      `SELECT COUNT(*) AS cnt FROM (${DashboardRepository.asSubquery(sql)}) AS dataset_rows`,
      params,
    );
    const [first] = DashboardRepository.asRows<{ cnt: number }>(rows);
    return Number(first?.cnt ?? 0);
  }

  private static asSubquery(sql: string): string {
    return sql.trim().replace(/;+\s*$/, "");
  }
}

export interface DashboardRow {
  nid: number;
  stitle: string;
}

export interface ScreenRow {
  nid: number;
  ndashboardid: number;
  stitle: string | null;
  norder: number | null;
}

export interface ControlRow {
  nid: number;
  nscreenid: number;
  scode: string;
  slabel: string | null;
  nviewtype: number;
  nord: number | null;
  nparentcontrolid: number | null;
  squery: string;
}

export interface ControlDefaultRow {
  ncontrolid: number;
  svalue: string;
}

/**
 * Строка источника контрола.
 *
 * `value` — то, что видит клиент и что уходит в виджеты, `key` — то, по чему
 * фильтруются дети (город «Москва» при регионе «MSK»). Если источник не отдаёт
 * отдельной колонки ключа, в качестве ключа берётся `value`.
 */
export interface ControlRowItem {
  value: string;
  key?: string | null;
  name?: string | null;
}

export interface WidgetRow {
  nid: number;
  nscreenid: number;
  ndatasetid: number;
  stitle: string | null;
  nord: number | null;
  dataset_title: string;
  dataset_sql: string;
}

export interface WidgetControlRow {
  nwidgetid: number;
  ncontrolid: number;
  nord: number | null;
}

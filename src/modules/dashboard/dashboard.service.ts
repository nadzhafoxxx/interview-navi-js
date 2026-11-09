import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ReqCtxService } from "../../common/context/req-context.service";
import { ControlGraph } from "../builders/control.graph";
import { ControlService, type ControlParams } from "../builders/control.service";
import type { ControlView } from "../builders/control.view";
import {
  WidgetService,
  type WidgetPagination,
} from "../builders/widget.service";
import type { WidgetView } from "../builders/widget.view";
import {
  DashboardRepository,
  type ControlRow,
} from "../dashboard-repository/dashboard.repository";
import { DashboardEntity } from "./dashboard.entity";
import { DEFAULT_PAGE_SIZE } from "./dashboard.constants";

export interface RenderDashboardArgs {
  dashboardId: number;
  screenId: number;
  params: ControlParams;
  pagination?: Partial<WidgetPagination>;
}

export interface RenderDashboardResult {
  dashboard: { nid: number; stitle: string };
  screen: { nid: number; stitle?: string };
  controls: ControlView[];
  controlsDependency: Record<string, string>;
  widgets: WidgetView[];
  dtCompileStart: string;
  dtCompileEnd: string;
}

/**
 * Оркестратор рендера: собрать снимок из БД -> построить граф ->
 * вычислить контролы параллельно -> посчитать виджеты -> отдать результат.
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly repository: DashboardRepository,
    private readonly controlService: ControlService,
    private readonly widgetService: WidgetService,
    private readonly ctx: ReqCtxService,
  ) {}

  public async renderDashboard({
    dashboardId,
    screenId,
    params,
    pagination,
  }: RenderDashboardArgs): Promise<RenderDashboardResult> {
    const dtCompileStart = new Date().toISOString();
    const requestId = this.ctx.isActive() ? this.ctx.get("requestId") : undefined;
    this.logger.debug(
      `Рендер дашборда ${dashboardId}, экран ${screenId}, requestId=${requestId ?? "-"}`,
    );

    const { entity, params: controlParams } = await this.initDashboard(
      dashboardId,
      screenId,
      params,
    );
    const controls = await this.processControls(entity, controlParams);
    const widgets = await this.processWidgets(entity, {
      page: pagination?.page ?? 1,
      pageSize: pagination?.pageSize ?? DEFAULT_PAGE_SIZE,
    });

    // Порядок ответа задаётся nOrd, а не порядком завершения промисов:
    // контролы и виджеты считаются параллельно, полагаться на порядок
    // массива нельзя.
    controls.sort((left, right) => left.nOrd - right.nOrd);
    widgets.sort((left, right) => left.nOrd - right.nOrd);

    return {
      dashboard: entity.dashboard,
      screen: {
        nid: entity.activeScreen.nid,
        stitle: entity.activeScreen.stitle ?? undefined,
      },
      controls,
      controlsDependency: Object.fromEntries(entity.controlsDependency),
      widgets,
      dtCompileStart,
      dtCompileEnd: new Date().toISOString(),
    };
  }

  /**
   * Чтения на инициализации идут параллельно: дашборд, экраны, контролы
   * и виджеты независимы друг от друга. Привязки виджетов и дефолты
   * контролов зависят от этих списков, поэтому это второй шаг.
   */
  private async initDashboard(
    dashboardId: number,
    screenId: number,
    params: ControlParams,
  ) {
    const [dashboard, screens, controls, widgets] = await Promise.all([
      this.repository.getDashboard(dashboardId),
      this.repository.getScreens(dashboardId),
      this.repository.getControls(screenId),
      this.repository.getWidgets(screenId),
    ]);

    if (!dashboard) {
      throw new NotFoundException(`Дашборд ${dashboardId} не найден`);
    }

    const entity = new DashboardEntity(
      dashboard,
      screens,
      controls,
      screenId,
      widgets,
    );

    const [widgetControls, defaultRows] = await Promise.all([
      this.repository.getWidgetControls(widgets.map((widget) => widget.nid)),
      this.repository.getControlDefaults(
        controls.map((control) => control.nid),
      ),
    ]);

    entity.widgetControlIds = this.groupWidgetControls(widgetControls);

    // Дефолты не перекрывают явно переданные параметры — они лишь
    // заполняют то, чего в запросе нет. Но если запрос переопределил
    // контрол-родителя, дефолт ребёнка становится невалидным: например,
    // город «Москва» при запрошенном регионе SPB. Положение спасает
    // ControlService — он возьмёт первое значение источника.
    const mergedParams: ControlParams = this.applyDefaults(
      controls,
      params,
      this.mapDefaults(controls, defaultRows),
    );

    return { entity, params: mergedParams };
  }

  /**
   * Накладывает дефолты с учётом графа: дефолт контрола применяется,
   * только если запрос не задал ни сам контрол, ни кого-либо из его предков.
   */
  private applyDefaults(
    controls: ControlRow[],
    params: ControlParams,
    defaults: ControlParams,
  ): ControlParams {
    const byId = new Map(controls.map((control) => [control.nid, control]));
    const result: ControlParams = { ...defaults, ...params };

    for (const control of controls) {
      const defaultValue = defaults[control.scode];
      if (defaultValue === undefined || params[control.scode] !== undefined) {
        continue;
      }

      let parentId = control.nparentcontrolid;
      while (parentId !== null) {
        const parent = byId.get(parentId);
        if (!parent) {
          break;
        }
        if (params[parent.scode] !== undefined) {
          delete result[control.scode];
          break;
        }
        parentId = parent.nparentcontrolid;
      }
    }

    return result;
  }

  private groupWidgetControls(
    rows: { nwidgetid: number; ncontrolid: number; nord: number | null }[],
  ): Map<number, number[]> {
    const result = new Map<number, number[]>();
    for (const row of rows) {
      const list = result.get(row.nwidgetid) ?? [];
      list.push(row.ncontrolid);
      result.set(row.nwidgetid, list);
    }
    return result;
  }

  private mapDefaults(
    controls: ControlRow[],
    rows: { ncontrolid: number; svalue: string }[],
  ): Record<string, string> {
    const codeById = new Map(controls.map((control) => [control.nid, control.scode]));
    const result: Record<string, string> = {};

    for (const row of rows) {
      const code = codeById.get(row.ncontrolid);
      if (code) {
        result[code] = row.svalue;
      }
    }

    return result;
  }

  /**
   * Контролы вычисляются через граф. Параметры для виджетов накапливаются
   * отдельно в разрезе id контрола: виджету нужны значения по id, а не по scode,
   * и смешивать эти пространства имён в одном объекте — источник ошибок.
   */
  private async processControls(
    entity: DashboardEntity,
    params: ControlParams,
  ): Promise<ControlView[]> {
    const graph = new ControlGraph(entity.controls);
    this.logger.debug(`Control graph\n${graph.toString()}`);

    const viewsByControl = new Map<number, ControlView>();
    // Ключ контрола для фильтров детей. По scode его не найти: ребёнку нужен
    // ключ именно родителя (город -> регион), поэтому копим по nid.
    const keysByControl = new Map<number, string>();

    await graph.processViews(async (control) => {
      const parentId = control.nparentcontrolid;
      const { view, key } = await this.controlService.buildControl({
        control,
        params,
        parentValue: parentId === null ? undefined : keysByControl.get(parentId),
      });
      viewsByControl.set(control.nid, view);
      keysByControl.set(control.nid, key);

      // значение контрола становится параметром для его детей и для виджетов
      params[control.scode] = view.sValue;
      entity.controlValues[control.nid] = view.sValue;
    });

    entity.controlsDependency = graph.controlsDependency;

    return entity.getScreenControls().map((control) => {
      const view = viewsByControl.get(control.nid);
      if (!view) {
        throw new Error(`Контрол ${control.nid} не был вычислен`);
      }
      return view;
    });
  }

  /**
   * Виджеты считаются после контролов (им нужны их значения) и параллельно
   * друг с другом — между собой они не связаны.
   *
   * Виджету значения передаются по id контрола: привязка widget_controls
   * ссылается на ncontrolid, а params запроса — на scode.
   */
  private async processWidgets(
    entity: DashboardEntity,
    pagination: WidgetPagination,
  ): Promise<WidgetView[]> {
    return Promise.all(
      entity.getScreenWidgets().map((widget) =>
        this.widgetService.buildWidget({
          widget,
          controlIds: entity.widgetControlIds.get(widget.nid) ?? [],
          valuesById: entity.controlValues,
          pagination,
        }),
      ),
    );
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ControlRow,
  DashboardRow,
  ScreenRow,
  WidgetRow,
} from "../dashboard-repository/dashboard.repository";

/**
 * Агрегат дашборда в памяти: снимок данных из БД плюс доменные операции,
 * которым не нужны внешние источники (выбор активного экрана, выборка
 * контролов и виджетов экрана). Сериализацией занимается контроллер.
 */
@Injectable()
export class DashboardEntity {
  public activeScreen!: ScreenRow;

  /** Заполняется оркестратором после построения графа: ребёнок -> родитель. */
  public controlsDependency = new Map<string, string>();

  /** Значения контролов после вычисления, по id — вход для виджетов. */
  public controlValues: Record<number, string> = {};

  /** Привязки виджетов к контролам: widgetId -> controlId[] в порядке nord. */
  public widgetControlIds = new Map<number, number[]>();

  constructor(
    public readonly dashboard: DashboardRow,
    public readonly screens: ScreenRow[],
    public readonly controls: ControlRow[],
    screenId?: number,
    public readonly widgets: WidgetRow[] = [],
  ) {
    this.initActiveScreen(screenId);
  }

  private initActiveScreen(screenId?: number): void {
    if (screenId !== undefined) {
      const requested = this.screens.find((screen) => screen.nid === screenId);
      if (!requested) {
        throw new NotFoundException(
          `Экран ${screenId} не принадлежит дашборду ${this.dashboard.nid}`,
        );
      }
      this.activeScreen = requested;
      return;
    }

    const first = this.screens[0];
    if (!first) {
      throw new Error(`У дашборда ${this.dashboard.nid} нет экранов`);
    }
    this.activeScreen = first;
  }

  /** Контролы активного экрана — вход для ControlGraph. */
  public getScreenControls(): ControlRow[] {
    return this.controls.filter(
      (control) => control.nscreenid === this.activeScreen.nid,
    );
  }

  /** Виджеты активного экрана — вход для WidgetService. */
  public getScreenWidgets(): WidgetRow[] {
    return this.widgets.filter(
      (widget) => widget.nscreenid === this.activeScreen.nid,
    );
  }
}

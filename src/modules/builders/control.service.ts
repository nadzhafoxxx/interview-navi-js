import { Injectable, Logger } from "@nestjs/common";
import {
  DashboardRepository,
  type ControlRow,
  type ControlRowItem,
} from "../dashboard-repository/dashboard.repository";
import type { ControlView } from "./control.view";

/** Значения контролов, доступные при рендере (пришли в запросе или уже вычислены). */
export type ControlParams = Record<string, string>;

export interface BuildControlArgs {
  control: ControlRow;
  params: ControlParams;
  /** значение родителя: подставляется в `?` источника строк контрола */
  parentValue?: string;
}

/** Вычисленный контрол вместе с ключом, по которому фильтруются его дети. */
export interface BuiltControl {
  view: ControlView;
  key: string;
}

/**
 * Вычисляет один контрол.
 *
 * Контракт функциональный: результат возвращается, а не пишется в общий
 * мутируемый объект. Именно поэтому ветки графа можно вычислять параллельно.
 */
@Injectable()
export class ControlService {
  private readonly logger = new Logger(ControlService.name);

  constructor(private readonly repository: DashboardRepository) {}

  public async buildControl({
    control,
    params,
    parentValue,
  }: BuildControlArgs): Promise<BuiltControl> {
    const selected = params[control.scode];
    const rows = await this.fetchRows(control, parentValue);
    // Источник может отдавать отдельную колонку ключа (город -> регион):
    // выбранное значение остаётся для клиента, ключ уходит в `?` детей.
    const keys = new Map(rows.map((row) => [row.value, row.key ?? row.value]));
    const selectedValue = selected ?? rows[0]?.value ?? "";

    return {
      view: {
        nControlObjectID: control.nid,
        sCode: control.scode,
        sLabel: control.slabel ?? undefined,
        nViewType: control.nviewtype,
        nOrd: control.nord ?? 0,
        sValue: selectedValue,
        rs: {
          r: rows.map((row) => ({
            sValue: row.value,
            sName: row.name ?? undefined,
            isSelected: row.value === selectedValue ? 1 : undefined,
          })),
        },
      },
      // Выбранного значения может не быть в источнике (запрос переопределил
      // родителя) — тогда ключом остаётся оно само, и детей просто не будет.
      key: keys.get(selectedValue) ?? selectedValue,
    };
  }

  /** Строки источника контрола; значение родителя подставляется bind-ом. */
  private async fetchRows(
    control: ControlRow,
    parentValue?: string,
  ): Promise<ControlRowItem[]> {
    try {
      return await this.repository.getControlRows(
        control.squery,
        parentValue === undefined ? [] : [parentValue],
      );
    } catch (error) {
      this.logger.error(
        `Не удалось получить строки контрола ${control.nid} (${control.scode})`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}

/**
 * Представление контрола в ответе ручки.
 * Имена полей — из оригинального проекта, чтобы ответ узнавался.
 */
export interface ControlView {
  nControlObjectID: number;
  sCode: string;
  sLabel?: string;
  nViewType: number;
  nOrd: number;
  /** вычисленное значение контрола: выбранное или первое из списка */
  sValue: string;
  rs: {
    r: {
      sValue: string;
      sName?: string;
      isSelected?: 1;
    }[];
  };
}

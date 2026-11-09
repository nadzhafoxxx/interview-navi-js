/**
 * Тип строки контрола.
 *
 * Выводится из репозитория, а не описывается вручную: схема БД — источник
 * истины, и при изменении select-а в репозитории тип поедет автоматически.
 * Здесь объявлен только контрактный минимум, чтобы граф не зависел от Nest.
 */
export interface ControlLike {
  nid: number;
  scode: string;
  nparentcontrolid: number | null;
}

export type ControlNode<T extends ControlLike = ControlLike> = {
  /** id контрола в виде строки — ключ узла графа */
  id: string;
  /** контролы, которые зависят от этого (его дети) */
  childIds: Set<string>;
  /** контролы, от которых зависит этот (его родители) */
  parentIds: Set<string>;
  control: T;
};

/**
 * Граф зависимостей контролов.
 *
 * Идея: контролы образуют DAG (родитель -> дети). Ребёнку для вычисления
 * нужны значения родителей, поэтому порядок обязателен, а сами вычисления
 * независимых веток должны идти параллельно. Промис каждой ноды мемоизируется,
 * чтобы общий родитель не посчитался дважды при двух детях — граф работает
 * одновременно как схема зависимостей и как дедупликатор работы.
 */
export class ControlGraph<T extends ControlLike = ControlLike> {
  public readonly graph: Record<string, ControlNode<T>> = {};

  /** связь ребёнок -> родитель, отдаётся клиенту как есть */
  public readonly controlsDependency = new Map<string, string>();

  private readonly controlProcessMap: Record<string, Promise<void> | undefined> = {};

  constructor(controls: T[]) {
    this.initGraph(controls);
    this.linkTree(controls);
  }

  private initGraph(controls: T[]): void {
    for (const control of controls) {
      const id = String(control.nid);
      this.graph[id] = {
        id,
        childIds: new Set(),
        parentIds: new Set(),
        control,
      };
    }
  }

  /**
   * Связываем узлы по nparentcontrolid.
   * Родитель, которого нет среди контролов экрана, игнорируется:
   * контрол просто становится корнем.
   */
  private linkTree(controls: T[]): void {
    for (const control of controls) {
      if (control.nparentcontrolid === null) {
        continue;
      }

      const childId = String(control.nid);
      const parentId = String(control.nparentcontrolid);
      const parent = this.graph[parentId];

      if (!parent) {
        continue;
      }

      parent.childIds.add(childId);
      this.graph[childId].parentIds.add(parentId);
      this.controlsDependency.set(childId, parentId);
    }
  }

  /**
   * Запускает вычисление всех нод. Стартуем с листьев графа — нод без
   * зависимых детей: `dfs` идёт вверх по `parentIds`, поэтому от листьев
   * он дотягивается до корней, а независимые ветки считаются параллельно.
   */
  public async processViews(cb: (control: T) => Promise<void>): Promise<void> {
    const startIds = Object.values(this.graph)
      .filter((node) => node.childIds.size === 0)
      .map((node) => node.id);

    await Promise.all(
      startIds.map((id) => this.getPromiseOfControlCb(cb, this.graph[id])),
    );
  }

  /**
   * Ждёт всех родителей (параллельно), затем вычисляет текущую ноду:
   * родитель должен быть посчитан раньше ребёнка, который его фильтрует.
   * Колбэк вызывается ровно один раз на ноду — гарантия из мемоизации.
   */
  private async dfs(
    node: ControlNode<T>,
    cb: (control: T) => Promise<void>,
  ): Promise<void> {
    await Promise.all(
      [...node.parentIds].map((parentId) =>
        this.getPromiseOfControlCb(cb, this.graph[parentId]),
      ),
    );

    await cb(node.control);
  }

  /** Возвращает готовый или новосозданный промис вычисления ноды. */
  private getPromiseOfControlCb(
    cb: (control: T) => Promise<void>,
    node: ControlNode<T>,
  ): Promise<void> {
    const existing = this.controlProcessMap[node.id];
    if (existing) {
      return existing;
    }

    const promise = this.dfs(node, cb);
    this.controlProcessMap[node.id] = promise;
    return promise;
  }

  /** Текстовое представление для логов. */
  public toString(): string {
    return Object.values(this.graph)
      .map(
        (node) =>
          `${node.id}: chlds: ${[...node.childIds].join(",")} prnts: ${[...node.parentIds].join(",")}`,
      )
      .join("\n");
  }
}

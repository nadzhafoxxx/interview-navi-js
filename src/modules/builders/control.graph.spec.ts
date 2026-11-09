import { ControlGraph, type ControlLike } from "./control.graph";

interface TestControl extends ControlLike {
  scode: string;
}

const control = (
  nid: number,
  nparentcontrolid: number | null = null,
): TestControl => ({ nid, scode: `c${nid}`, nparentcontrolid });

describe("ControlGraph", () => {
  describe("построение связей", () => {
    it("связывает узлы по nparentcontrolid", () => {
      const graph = new ControlGraph([
        control(1),
        control(2, 1),
        control(3, 2),
      ]);

      expect([...graph.graph["1"].childIds]).toEqual(["2"]);
      expect([...graph.graph["2"].parentIds]).toEqual(["1"]);
      expect([...graph.graph["2"].childIds]).toEqual(["3"]);
      expect([...graph.graph["3"].parentIds]).toEqual(["2"]);
    });

    it("заполняет controlsDependency как ребёнок -> родитель", () => {
      const graph = new ControlGraph([control(1), control(2, 1), control(3, 1)]);

      expect(Object.fromEntries(graph.controlsDependency)).toEqual({
        "2": "1",
        "3": "1",
      });
    });

    it("игнорирует ссылку на отсутствующего родителя", () => {
      const graph = new ControlGraph([control(1, 99)]);

      expect(graph.graph["1"].parentIds.size).toBe(0);
      expect(graph.controlsDependency.size).toBe(0);
    });

    it("отдаёт читаемое представление для логов", () => {
      const graph = new ControlGraph([control(1), control(2, 1)]);

      expect(graph.toString()).toContain("1: chlds: 2 prnts: ");
      expect(graph.toString()).toContain("2: chlds:  prnts: 1");
    });
  });

  describe("порядок вычисления", () => {
    it("вычисляет родителя раньше ребёнка", async () => {
      const graph = new ControlGraph([control(1), control(2, 1), control(3, 2)]);
      const order: number[] = [];

      await graph.processViews(async (item) => {
        order.push(item.nid);
      });

      expect(order.indexOf(1)).toBeLessThan(order.indexOf(2));
      expect(order.indexOf(2)).toBeLessThan(order.indexOf(3));
    });

    it("вычисляет общий родитель ровно один раз (ромб)", async () => {
      //   1
      //  / \
      // 2   3
      const graph = new ControlGraph([
        control(1),
        control(2, 1),
        control(3, 1),
      ]);
      const calls = new Map<number, number>();

      await graph.processViews(async (item) => {
        calls.set(item.nid, (calls.get(item.nid) ?? 0) + 1);
        // задержка усиливает гонку: без мемоизации родитель посчитается дважды
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(calls.get(1)).toBe(1);
      expect(calls.get(2)).toBe(1);
      expect(calls.get(3)).toBe(1);
    });

    it("вычисляет все ноды, включая независимые корни", async () => {
      const graph = new ControlGraph([
        control(1),
        control(2, 1),
        control(3),
        control(4, 3),
        control(5, 4),
      ]);
      const visited: number[] = [];

      await graph.processViews(async (item) => {
        visited.push(item.nid);
      });

      expect(visited.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("запускает независимые ветки параллельно", async () => {
      // Две ветки по 100мс: последовательное выполнение дало бы ~200мс.
      const graph = new ControlGraph([control(1), control(2)]);
      let started = 0;
      let maxParallel = 0;

      const startedAt = Date.now();
      await graph.processViews(async () => {
        started += 1;
        maxParallel = Math.max(maxParallel, started);
        await new Promise((resolve) => setTimeout(resolve, 100));
        started -= 1;
      });
      const elapsed = Date.now() - startedAt;

      expect(maxParallel).toBe(2);
      expect(elapsed).toBeLessThan(190);
    });

    it("пробрасывает ошибку колбэка наружу", async () => {
      const graph = new ControlGraph([control(1), control(2, 1)]);

      await expect(
        graph.processViews(async (item) => {
          if (item.nid === 2) {
            throw new Error("сломалось на втором");
          }
        }),
      ).rejects.toThrow("сломалось на втором");
    });
  });
});

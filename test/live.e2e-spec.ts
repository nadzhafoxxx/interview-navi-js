/**
 * Три вызова — ровно те, что человек шлёт в curl к запущенному сервису:
 *
 *   npm run start:dev        # в соседнем терминале
 *   npm run test:live        # этот файл; ничего не запускает и не гасит
 *
 * Данные — из data/seed.sql: экраны 10, 20 и 30. Третий вызов (контролы
 * 21 и 22) на сломанном состоянии висит без ответа — ожидание ограничено
 * 5s, чтобы отладка не упиралась в вечное ожидание.
 */

const BASE_URL = process.env.LIVE_BASE_URL ?? "http://localhost:3000";
const TIMEOUT_MS = 5000;

/** Проверка на старте: без запущенного сервиса дальше идти нет смысла. */
const assertServiceIsUp = async (): Promise<void> => {
  try {
    await fetch(BASE_URL, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error(
      `Сервис не отвечает на ${BASE_URL} — поднимите npm run start:dev и повторите`,
    );
  }
};

interface RenderResult {
  status: number;
  body: {
    controlsDependency: Record<string, string>;
  };
}

const render = async (
  dashboardId: number,
  body: Record<string, unknown>,
): Promise<RenderResult> => {
  const response = await fetch(`${BASE_URL}/dashboards/${dashboardId}/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  return {
    status: response.status,
    body: (await response.json()) as RenderResult["body"],
  };
};

describe(`Живой сервис ${BASE_URL}`, () => {
  beforeAll(async () => {
    await assertServiceIsUp();
  }, 15_000);

  // eslint-disable-next-line no-console
  const log = (line: string) => console.log(line);

  it("дашборд 1, экран 10 — цепочка 11 -> 12 -> 13, независимый 14, ромб 12 -> 13,15", async () => {
    const result = await render(1, { screen: 10 });
    log(`POST /dashboards/1/render {"screen":10} -> ${result.status}`);
    console.log(result);

    expect(result.status).toBe(200);
    expect(result.body.controlsDependency).toEqual({
      "12": "11",
      "13": "12",
      "15": "12",
    });
  });

  it("дашборд 2, экран 20 — ветвление 101 -> 102 -> 104 и 101 -> 103", async () => {
    const result = await render(2, { screen: 20 });
    log(`POST /dashboards/2/render {"screen":20} -> ${result.status}`);
    console.log(result);
    expect(result.status).toBe(200);
    expect(result.body.controlsDependency).toEqual({
      "102": "101",
      "103": "101",
      "104": "102",
    });
  });

  it("дашборд 3, экран 30 — зависимости контролов 21 и 22", async () => {
    // На сломанном состоянии ответа не дождаться: вызов падает по таймауту.
    const result = await render(3, { screen: 30 });
    console.log(result);
    log(`POST /dashboards/3/render {"screen":30} -> ${result.status}`);

    expect(result.status).toBe(200);
  });
});

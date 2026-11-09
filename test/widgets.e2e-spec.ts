import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { HttpAdapterHost } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { ReqCtxInterceptor } from "../src/common/context/req-context.interceptor";
import { ReqCtxService } from "../src/common/context/req-context.service";
import { BaseConfigService } from "../src/config/base-config.service";
import { writeTestConfig } from "./test-config";

interface WidgetDto {
  nWidgetID: number;
  sTitle?: string;
  nDatasetID: number;
  sDatasetTitle: string;
  nOrd: number;
  params: Record<string, string>;
  columns: string[];
  rows: Record<string, unknown>[];
  pagination: { page: number; pageSize: number; total: number };
}

/**
 * Виджеты и датасеты: SQL из datasets с bind-подстановкой значений контролов.
 */
describe("Виджеты и датасеты (e2e)", () => {
  let app: INestApplication;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = join(tmpdir(), `interview-widgets-${randomUUID()}.duckdb`);

    // e2e не зависит от app.yml рабочей копии: собираем конфиг сами,
    // иначе тесты упадут вместе с локальным конфигом.
    const baseConfig = new BaseConfigService(
      writeTestConfig(join(tmpdir(), `interview-config-${randomUUID()}.yml`), {
        path: dbPath,
        bootstrap: {
          schema: join(process.cwd(), "data/schema.sql"),
          seed: join(process.cwd(), "data/seed.sql"),
        },
      }),
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(baseConfig)],
    }).compile();

    app = moduleRef.createNestApplication();
    const reqCtx = app.get(ReqCtxService);

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ReqCtxInterceptor(reqCtx));
    app.useGlobalFilters(
      new AllExceptionsFilter(reqCtx, app.get(HttpAdapterHost)),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (dbPath) {
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}.wal`, { force: true });
    }
  });

  const render = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post("/dashboards/1/render").send(body);

  it("возвращает виджеты экрана по порядку nOrd вместе с колонками и строками", async () => {
    const response = await render({ screen: 10 }).expect(200);
    const widgets: WidgetDto[] = response.body.widgets;

    expect(widgets.map((widget) => widget.nWidgetID)).toEqual([1001, 1002]);
    expect(widgets[0]).toMatchObject({
      sTitle: "Продажи",
      nDatasetID: 1,
      sDatasetTitle: "Продажи по городам",
      nOrd: 1,
    });
    expect(widgets[0].columns).toEqual(["Город", "Канал", "Период", "Сумма"]);
    expect(widgets[0].rows).toEqual([
      { Город: "Москва", Канал: "Розница", Период: "2026-02", Сумма: 172000 },
      { Город: "Москва", Канал: "Онлайн", Период: "2026-02", Сумма: 101000 },
    ]);
  });

  it("подставляет значения контролов в SQL датасета в порядке привязки", async () => {
    const response = await render({ screen: 10 }).expect(200);
    const widgets: WidgetDto[] = response.body.widgets;

    // city -> первый ?, period -> второй ?
    expect(widgets[0].params).toEqual({ "12": "Москва", "14": "2026-02" });

    // смена региона меняет город по умолчанию, а с ним и строки виджета
    const spb = await render({ screen: 10, params: { region: "SPB" } })
      .expect(200);
    const spbWidgets: WidgetDto[] = spb.body.widgets;

    expect(spbWidgets[0].params["12"]).toBe("Санкт-Петербург");
    expect(
      spbWidgets[0].rows.every((row) => row["Город"] === "Санкт-Петербург"),
    ).toBe(true);
  });

  it("режет строки по pageSize и считает total по всему датасету", async () => {
    const response = await render({ screen: 10, page: 1, pageSize: 1 })
      .expect(200);
    const [first]: WidgetDto[] = response.body.widgets;

    expect(first.rows).toHaveLength(1);
    expect(first.pagination).toEqual({ page: 1, pageSize: 1, total: 2 });
  });

  it("отдаёт разные строки на второй странице", async () => {
    const first = await render({ screen: 10, page: 1, pageSize: 1 })
      .expect(200);
    const second = await render({ screen: 10, page: 2, pageSize: 1 })
      .expect(200);

    const firstRow = (first.body.widgets[0] as WidgetDto).rows[0];
    const secondRow = (second.body.widgets[0] as WidgetDto).rows[0];

    expect(firstRow).not.toEqual(secondRow);
    expect((second.body.widgets[0] as WidgetDto).pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
    });
  });

  it("отдаёт пустую страницу за пределами данных, не меняя total", async () => {
    const response = await render({ screen: 10, page: 50, pageSize: 10 })
      .expect(200);
    const [first]: WidgetDto[] = response.body.widgets;

    expect(first.rows).toEqual([]);
    expect(first.columns).toEqual([]);
    expect(first.pagination).toEqual({ page: 50, pageSize: 10, total: 2 });
  });

  it("отклоняет pageSize больше MAX_PAGE_SIZE", async () => {
    const response = await render({ screen: 10, pageSize: 1000 })
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain("pageSize");
  });

  it("не подставляет SQL через значение контрола", async () => {
    const response = await render({
      screen: 10,
      params: { region: "' OR 1=1 --" },
    }).expect(200);

    // значение уходит bind-параметром: SQL не ломается, а подходящего
    // региона просто нет — строк у города не остаётся.
    const widgets: WidgetDto[] = response.body.widgets;
    expect(widgets[0].params["12"]).toBe("");
    expect(widgets[0].rows).toEqual([]);
    expect(widgets[1].rows).toEqual([]);

    // и это не мешает остальным контролам: период с датасета 1001
    // подставился как обычно, инъекция до SQL не дошла.
    expect(widgets[0].params["14"]).toBe("2026-02");
  });

  it("рендерит виджет дашборда 2 с привязкой к контролу segment", async () => {
    const response = await request(app.getHttpServer())
      .post("/dashboards/2/render")
      .send({ screen: 20 })
      .expect(200);

    const [widget]: WidgetDto[] = response.body.widgets;
    expect(widget.nWidgetID).toBe(2001);
    expect(widget.params).toEqual({ "102": "Retail" });
    expect(widget.rows).toHaveLength(2);
    expect(widget.pagination.total).toBe(2);
  });
});

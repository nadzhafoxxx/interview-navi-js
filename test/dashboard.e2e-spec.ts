import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";
import { ReqCtxInterceptor } from "../src/common/context/req-context.interceptor";
import { ReqCtxService } from "../src/common/context/req-context.service";
import { BaseConfigService } from "../src/config/base-config.service";
import { writeTestConfig } from "./test-config";
import { HttpAdapterHost } from "@nestjs/core";

/**
 * e2e: поднимаем настоящее приложение на временной БД, чтобы не зависеть
 * от локального data/dashboards.duckdb.
 */
describe("POST /dashboards/:id/render (e2e)", () => {
  let app: INestApplication;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = join(tmpdir(), `interview-${randomUUID()}.duckdb`);

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

  it("рендерит дашборд и возвращает контролы по порядку nOrd", async () => {
    const response = await request(app.getHttpServer())
      .post("/dashboards/1/render")
      .send({ screen: 10 })
      .expect(200);

    expect(response.body.dashboard).toEqual({
      nid: 1,
      stitle: 'Дашборд «Продажи»',
    });

    const codes = response.body.controls.map(
      (control: { sCode: string }) => control.sCode,
    );
    expect(codes).toEqual(["region", "city", "channel", "period", "manager"]);
  });

  it("возвращает controlsDependency по связям parent -> child", async () => {
    const response = await request(app.getHttpServer())
      .post("/dashboards/1/render")
      .send({ screen: 10 })
      .expect(200);

    expect(response.body.controlsDependency).toEqual({
      "12": "11",
      "13": "12",
      "15": "12",
    });
  });

  it("проставляет x-request-id из заголовка в ответ", async () => {
    const requestId = randomUUID();

    const response = await request(app.getHttpServer())
      .post("/dashboards/1/render")
      .set("x-request-id", requestId)
      .send({ screen: 10 })
      .expect(200);

    expect(response.headers["x-request-id"]).toBe(requestId);
  });

  it("игнорирует невалидный x-request-id и генерирует свой", async () => {
    const response = await request(app.getHttpServer())
      .post("/dashboards/1/render")
      .set("x-request-id", "not-a-uuid")
      .send({ screen: 10 })
      .expect(200);

    expect(response.headers["x-request-id"]).not.toBe("not-a-uuid");
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("отдаёт 404, если дашборда нет", async () => {
    await request(app.getHttpServer())
      .post("/dashboards/999/render")
      .send({ screen: 10 })
      .expect(404);
  });

  it("отдаёт 400 при невалидном теле", async () => {
    await request(app.getHttpServer())
      .post("/dashboards/1/render")
      .send({ screen: "abc" })
      .expect(400);
  });

  it("отдаёт 400, если screen не передан", async () => {
    const response = await request(app.getHttpServer())
      .post("/dashboards/1/render")
      .send({})
      .expect(400);

    expect(JSON.stringify(response.body.message)).toContain("screen");
  });

  it("отдаёт 404, если экрана нет у дашборда", async () => {
    await request(app.getHttpServer())
      .post("/dashboards/1/render")
      .send({ screen: 20 })
      .expect(404);
  });

  it("рендерит широкий граф дашборда 2", async () => {
    const response = await request(app.getHttpServer())
      .post("/dashboards/2/render")
      .send({ screen: 20 })
      .expect(200);

    expect(response.body.controls).toHaveLength(5);

    // Ветвление 101 -> 102 -> 104 и 101 -> 103: общий корень вычислен
    // один раз, все связи видны клиенту.
    expect(response.body.controlsDependency).toEqual({
      "102": "101",
      "103": "101",
      "104": "102",
    });

    const country = response.body.controls.find(
      (control: { sCode: string }) => control.sCode === "country",
    );
    // Порядок строк источника не гарантирован без ORDER BY в squery —
    // проверяем состав, а не порядок.
    expect(
      country.rs.r.map((row: { sValue: string }) => row.sValue).sort(),
    ).toEqual(["KZ", "RU"]);
  });

  it("рендерит дашборд 3 (контролы 21 и 22)", async () => {
    jest.setTimeout(5_000);

    await request(app.getHttpServer())
      .post("/dashboards/3/render")
      .send({ screen: 30 })
      .expect(200);
  });
});
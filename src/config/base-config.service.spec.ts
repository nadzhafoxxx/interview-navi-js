/**
 * Проверка конфига: дефолты применяются, неверный конфиг падает с понятной ошибкой.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BaseConfigService } from "./base-config.service";

describe("BaseConfigService", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (name: string, content: string) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  };

  it("читает app.yml и подставляет дефолты", () => {
    const path = write(
      "app.yml",
      [
        "services:",
        "  dashboard:",
        "    port: 3030",
        "database:",
        "  path: ./data/x.duckdb",
        "  bootstrap:",
        "    schema: ./data/schema.sql",
        "    seed: ./data/seed.sql",
        "logs:",
        "  level: debug",
      ].join("\n"),
    );

    const config = new BaseConfigService(path).get();

    // port пришёл числом из yml
    expect(config.services.dashboard.port).toBe(3030);
    // дефолты из схемы
    expect(config.services.dashboard.host).toBe("0.0.0.0");
    expect(config.requestTimeoutMs).toBe(30000);
  });

  it("приводит строковый порт к числу (Value.Convert)", () => {
    const path = write(
      "app.yml",
      [
        "services:",
        "  dashboard:",
        "    port: '3031'",
        "database:",
        "  path: ./x.duckdb",
        "  bootstrap:",
        "    schema: ./s.sql",
        "    seed: ./d.sql",
        "logs:",
        "  level: info",
      ].join("\n"),
    );

    expect(new BaseConfigService(path).get().services.dashboard.port).toBe(3031);
  });

  it("падает на отсутствующих обязательных полях", () => {
    const path = write("app.yml", "services:\n  dashboard:\n    port: 3030\n");

    expect(() => new BaseConfigService(path)).toThrow(/Некорректная конфигурация/);
  });

  it("падает на неверном уровне логирования", () => {
    const path = write(
      "app.yml",
      [
        "services:",
        "  dashboard:",
        "    port: 3030",
        "database:",
        "  path: ./x.duckdb",
        "  bootstrap:",
        "    schema: ./s.sql",
        "    seed: ./d.sql",
        "logs:",
        "  level: неверный",
      ].join("\n"),
    );

    expect(() => new BaseConfigService(path)).toThrow(/Некорректная конфигурация/);
  });

  it("падает на нечисловом порте с описанием поля", () => {
    const path = write(
      "app.yml",
      [
        "services:",
        "  dashboard:",
        "    port: not-a-number",
        "database:",
        "  path: ./x.duckdb",
        "  bootstrap:",
        "    schema: ./s.sql",
        "    seed: ./d.sql",
        "logs:",
        "  level: info",
      ].join("\n"),
    );

    expect(() => new BaseConfigService(path)).toThrow(/port/);
  });

  it("сообщает, если файла нет", () => {
    expect(() => new BaseConfigService(join(dir, "missing.yml"))).toThrow(
      /Не удалось прочитать конфигурационный файл/,
    );
  });
});

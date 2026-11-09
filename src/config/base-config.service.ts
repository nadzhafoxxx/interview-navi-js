import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Value } from "@sinclair/typebox/value";
import * as yaml from "js-yaml";
import { ConfigSchema } from "./config.schema";

/**
 * Загрузка и валидация app.yml.
 *
 * Конфиг читается ДО создания Nest-приложения: из него берутся порт, CORS
 * и уровень логов, поэтому сервис не может быть DI-провайдером самому себе.
 * Результат кладётся в ConfigModule как готовый объект.
 */
export class BaseConfigService {
  private readonly config: ConfigSchema;

  constructor(configPath?: string) {
    const path = resolve(
      configPath ?? process.env.CONFIG_FILE ?? "./app.yml",
    );

    let raw: unknown;
    try {
      raw = yaml.load(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(
        `Не удалось прочитать конфигурационный файл ${path}: ${(error as Error).message}`,
      );
    }

    this.config = BaseConfigService.parse(raw, path);
  }

  /**
   * Приводит YAML к схеме в фиксированном порядке:
   * Convert -> Default -> Check -> Clean -> Decode.
   * Порядок важен: Convert приводит строки к числам/булевым, Default
   * заполняет отсутствующие поля, Clean выкидывает лишние ключи из yml.
   */
  private static parse(raw: unknown, path: string): ConfigSchema {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`Конфигурационный файл ${path} пуст или не является объектом`);
    }

    const converted = Value.Convert(ConfigSchema, raw);
    const withDefaults = Value.Default(ConfigSchema, converted);

    if (!Value.Check(ConfigSchema, withDefaults)) {
      const errors = [...Value.Errors(ConfigSchema, withDefaults)]
        .map((error) => `${error.path || "/"}: ${error.message}`)
        .join("; ");
      throw new Error(`Некорректная конфигурация ${path}: ${errors}`);
    }

    return Value.Decode(ConfigSchema, Value.Clean(ConfigSchema, withDefaults));
  }

  public get(): ConfigSchema {
    return this.config;
  }
}

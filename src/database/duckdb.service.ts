import { readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  DuckDBConnection,
  DuckDBInstance,
  type DuckDBValue,
} from "@duckdb/node-api";
import { ConfigService } from "../config/config.service";

/**
 * Обёртка над DuckDB: одно соединение на процесс, bootstrap схемы и сида.
 *
 * Тип значения для bind-параметров и строк ответа отдаётся наружу, чтобы
 * репозиторий не тянул типы драйвера самостоятельно.
 */
export type SqlValue = DuckDBValue;
export type SqlRow = Record<string, unknown>;

@Injectable()
export class DuckDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuckDbService.name);
  private instance!: DuckDBInstance;
  private connection!: DuckDBConnection;

  constructor(private readonly configService: ConfigService) {}

  public async onModuleInit(): Promise<void> {
    const { path, bootstrap } = this.configService.database;
    const dbPath = resolve(path);

    mkdirSync(dirname(dbPath), { recursive: true });
    this.instance = await DuckDBInstance.create(dbPath);
    this.connection = await this.instance.connect();

    this.logger.log(`DuckDB открыта: ${dbPath}`);
    await this.bootstrap(bootstrap.schema, bootstrap.seed);
  }

  public async onModuleDestroy(): Promise<void> {
    this.connection?.closeSync();
  }

  /**
   * Схема создаётся всегда (CREATE TABLE IF NOT EXISTS), сид — только если
   * таблица dashboards пуста. Так повторный старт не дублирует данные.
   */
  private async bootstrap(schemaPath: string, seedPath: string): Promise<void> {
    await this.exec(readFileSync(resolve(schemaPath), "utf8"));

    const rows = await this.query("SELECT COUNT(*) AS cnt FROM dashboards");
    const count = Number(rows[0]?.cnt ?? 0);
    if (count > 0) {
      this.logger.log(`Тестовые данные уже загружены (дашбордов: ${count})`);
      return;
    }

    await this.exec(readFileSync(resolve(seedPath), "utf8"));
    this.logger.log("Тестовые данные загружены из seed.sql");
  }

  /** Выполнение DDL/скрипта без результата. */
  public async exec(sql: string): Promise<void> {
    await this.connection.run(sql);
  }

  /**
   * Выполнение запроса с bind-параметрами.
   * Параметры передаются через `?`, а не склейкой SQL — так значения
   * не могут повлиять на структуру запроса.
   */
  public async query(sql: string, params: SqlValue[] = []): Promise<SqlRow[]> {
    const reader = await this.connection.runAndReadAll(sql, params);
    return reader.getRowObjects() as SqlRow[];
  }
}

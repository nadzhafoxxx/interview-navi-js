import { writeFileSync } from "node:fs";

interface TestConfigDatabase {
  path: string;
  bootstrap: { schema: string; seed: string };
}

/**
 * Конфиг для e2e: пишем минимальный yml во временный файл, чтобы тесты
 * не зависели от app.yml рабочей копии.
 */
export const writeTestConfig = (
  filePath: string,
  database: TestConfigDatabase,
): string => {
  const yml = [
    "api:",
    "  cors: ['*']",
    "services:",
    "  dashboard:",
    "    port: 3000",
    "    host: 127.0.0.1",
    "database:",
    `  path: ${database.path}`,
    "  bootstrap:",
    `    schema: ${database.bootstrap.schema}`,
    `    seed: ${database.bootstrap.seed}`,
    "logs:",
    "  level: error",
  ].join("\n");

  writeFileSync(filePath, yml);
  return filePath;
};

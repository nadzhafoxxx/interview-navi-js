/**
 * Токен value-провайдера с уже разобранным конфигом.
 *
 * Строка, а не Symbol: Symbol не попадает в metadata декораторов,
 * а строка работает и в DI, и в тестах (ts-jest компилирует файлы по одному).
 *
 * Объявлен отдельным файлом, чтобы не было цикла
 * config.module -> config.service -> config.module.
 */
export const BASE_CONFIG = "BASE_CONFIG";

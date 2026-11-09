import { Global, Module } from "@nestjs/common";
import { BaseConfigService } from "./base-config.service";
import { ConfigService } from "./config.service";
import { BASE_CONFIG } from "./config.tokens";

/**
 * ConfigModule получает уже разобранный BaseConfigService как value-провайдер:
 * конфиг читается в main.ts до создания приложения (нужны порт и уровень логов),
 * а ConfigService поверх него работает как обычный DI-сервис.
 */
@Global()
@Module({})
export class ConfigModule {
  static forRoot(baseConfig: BaseConfigService) {
    return {
      module: ConfigModule,
      providers: [
        { provide: BASE_CONFIG, useValue: baseConfig },
        ConfigService,
      ],
      exports: [ConfigService],
    };
  }
}

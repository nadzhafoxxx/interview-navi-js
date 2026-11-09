import { Inject, Injectable } from "@nestjs/common";
import { BaseConfigService } from "./base-config.service";
import type { ConfigSchema } from "./config.schema";
import { BASE_CONFIG } from "./config.tokens";

/**
 * Типизированный доступ к конфигу из сервисов.
 * baseConfig приходит из main.ts — конфиг уже прочитан и провалидирован.
 */
@Injectable()
export class ConfigService {
  private readonly config: ConfigSchema;

  constructor(@Inject(BASE_CONFIG) baseConfig: BaseConfigService) {
    this.config = baseConfig.get();
  }

  public get api() {
    return this.config.api;
  }

  public get dashboardService() {
    return this.config.services.dashboard;
  }

  public get database() {
    return this.config.database;
  }

  public get logs() {
    return this.config.logs;
  }

  public get requestTimeoutMs() {
    return this.config.requestTimeoutMs;
  }
}

import { Module } from "@nestjs/common";
import { ClsModule } from "nestjs-cls";
import { ReqCtxModule } from "./common/context/req-context.module";
import { ConfigModule } from "./config/config.module";
import type { BaseConfigService } from "./config/base-config.service";
import { DatabaseModule } from "./database/database.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DashboardRepositoryModule } from "./modules/dashboard-repository/dashboard-repository.module";

@Module({})
export class AppModule {
  static forRoot(baseConfig: BaseConfigService) {
    return {
      module: AppModule,
      imports: [
        ClsModule.forRoot({
          global: true,
          middleware: { mount: true },
        }),
        ConfigModule.forRoot(baseConfig),
        ReqCtxModule,
        DatabaseModule,
        DashboardRepositoryModule,
        DashboardModule,
      ],
    };
  }
}

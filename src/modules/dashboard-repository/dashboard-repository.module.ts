import { Global, Module } from "@nestjs/common";
import { DashboardRepository } from "./dashboard.repository";

@Global()
@Module({
  providers: [DashboardRepository],
  exports: [DashboardRepository],
})
export class DashboardRepositoryModule {}

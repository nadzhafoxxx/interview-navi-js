import { Module } from "@nestjs/common";
import { BuildersModule } from "../builders/builders.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [BuildersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

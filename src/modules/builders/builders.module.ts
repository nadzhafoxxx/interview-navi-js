import { Module } from "@nestjs/common";
import { ControlService } from "./control.service";
import { WidgetService } from "./widget.service";

@Module({
  providers: [ControlService, WidgetService],
  exports: [ControlService, WidgetService],
})
export class BuildersModule {}

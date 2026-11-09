import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseInterceptors,
} from "@nestjs/common";
import { RemoveUndefinedInterceptor } from "../../common/interceptors/remove-undefined.interceptor";
import { RenderDashboardDto } from "./dashboard.dto";
import {
  DashboardService,
  type RenderDashboardResult,
} from "./dashboard.service";

@Controller("dashboards")
@UseInterceptors(RemoveUndefinedInterceptor)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Post(":id/render")
  @HttpCode(200)
  public async render(
    @Param("id", ParseIntPipe) dashboardId: number,
    @Body() dto: RenderDashboardDto,
  ): Promise<RenderDashboardResult> {
    const params = dto.params ?? {};

    // Ключи params сравниваются со scode, поэтому значения-не-строки
    // молча превратились бы в "[object Object]" уже внутри SQL.
    for (const [key, value] of Object.entries(params)) {
      if (typeof value !== "string") {
        throw new BadRequestException(
          `Параметр "${key}" должен быть строкой`,
        );
      }
    }

    return this.dashboardService.renderDashboard({
      dashboardId,
      screenId: dto.screen,
      params: { ...params },
      pagination: { page: dto.page, pageSize: dto.pageSize },
    });
  }
}

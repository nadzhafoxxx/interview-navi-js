import { Global, Module } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { ReqCtxService } from "./req-context.service";

/**
 * Отдаёт ReqCtxService как алиас на ClsService и встраивает сам себя,
 * чтобы сервисы получали типизированный контекст и ничего не знали про nestjs-cls.
 */
@Global()
@Module({
  providers: [
    { provide: ReqCtxService, useExisting: ClsService },
  ],
  exports: [ReqCtxService],
})
export class ReqCtxModule {}

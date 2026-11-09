import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger,
} from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { HttpAdapterHost } from "@nestjs/core";
import type { Request } from "express";
import { ReqCtxService } from "../context/req-context.service";

/**
 * Логирует всё, что вылетело из обработчика, и отдаёт стандартный ответ Nest.
 * Наследование от BaseExceptionFilter нужно, чтобы не дублировать формирование
 * тела ошибки и кодов статуса.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly ctx: ReqCtxService,
    adapterHost: HttpAdapterHost,
  ) {
    super(adapterHost.httpAdapter);
  }

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const requestId = this.ctx.isActive() ? this.ctx.get("requestId") : undefined;

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const message = isHttp
      ? exception.message
      : (exception as Error)?.message ?? String(exception);

    // requestId уже проставляет ReqCtxInterceptor в ответ, а здесь он нужен,
    // чтобы строку лога можно было связать с запросом.
    const line = `${request.method} ${request.originalUrl} -> ${status} ${message} requestId=${requestId ?? "-"}`;
    if (status >= 500) {
      this.logger.error(
        line,
        !isHttp && exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(line);
    }

    super.catch(exception, host);
  }
}

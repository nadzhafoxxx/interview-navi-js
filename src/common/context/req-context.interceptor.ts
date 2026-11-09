import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { ReqCtxService } from "./req-context.service";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const REQUEST_ID_HEADER = "x-request-id";
export const USER_ID_HEADER = "x-user-id";

/**
 * Заполняет ReqCtxStore до входа в сервисы и кладёт requestId в ответ.
 * Значение из заголовка принимаем только если это UUID — иначе в логах
 * окажется произвольная строка от клиента.
 */
@Injectable()
export class ReqCtxInterceptor implements NestInterceptor {
  constructor(private readonly ctx: ReqCtxService) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId = incoming && UUID_RE.test(incoming) ? incoming : randomUUID();

    this.ctx.set("requestId", requestId);
    this.ctx.set("userId", request.header(USER_ID_HEADER) ?? undefined);

    response.setHeader(REQUEST_ID_HEADER, requestId);

    return next.handle();
  }
}

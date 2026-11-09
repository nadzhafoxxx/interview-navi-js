import { ClsService, ClsStore } from "nestjs-cls";

/**
 * Данные, доступные в любом сервисе в рамках обработки одного запроса.
 * Хранилище создаётся middleware из ClsModule.forRoot, поэтому не нужно
 * протаскивать контекст аргументами через всю цепочку вызовов.
 */
export interface ReqCtxStore extends ClsStore {
  /** из заголовка x-request-id (если валидный UUID) либо сгенерированный */
  requestId: string;
  /** из заголовка x-user-id */
  userId?: string;
}

export class ReqCtxService extends ClsService<ReqCtxStore> {}

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, map } from "rxjs";

/**
 * Рекурсивно вычищает undefined из ответа.
 * JSON.stringify превращает undefined-поля объектов в null, а undefined
 * в массивах — в null тоже, из-за чего клиент не отличает «нет значения»
 * от «значение null». Проще не отдавать такие поля вовсе.
 */
@Injectable()
export class RemoveUndefinedInterceptor implements NestInterceptor {
  public intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => removeUndefined(data)));
  }
}

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefined(item)) as unknown as T;
  }

  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) {
        result[key] = removeUndefined(item);
      }
    }
    return result as T;
  }

  return value;
}

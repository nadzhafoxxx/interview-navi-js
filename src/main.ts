import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ReqCtxInterceptor } from "./common/context/req-context.interceptor";
import { ReqCtxService } from "./common/context/req-context.service";
import { BaseConfigService } from "./config/base-config.service";

async function bootstrap(): Promise<void> {
  // Конфиг читается до создания Nest: из него берутся порт и CORS.
  const baseConfig = new BaseConfigService();
  const config = baseConfig.get();

  // Логгер стандартный: без параметров Nest использует свой ConsoleLogger
  // с тем же уровнем (info), что был в конфиге.
  const app = await NestFactory.create(AppModule.forRoot(baseConfig));

  app.setGlobalPrefix("/");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new ReqCtxInterceptor(app.get(ReqCtxService)));
  app.useGlobalFilters(
    new AllExceptionsFilter(app.get(ReqCtxService), app.get(HttpAdapterHost)),
  );
  app.enableCors({ origin: config.api?.cors ?? ["*"] });

  const { port, host } = config.services.dashboard;
  await app.listen(port, host ?? "0.0.0.0");
}

void bootstrap();

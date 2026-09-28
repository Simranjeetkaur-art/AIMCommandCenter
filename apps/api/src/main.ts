import "reflect-metadata";
import { ValidationPipe, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      // A field the DTO does not declare is not silently accepted: it is an
      // error. Mass assignment is how a scope check gets bypassed.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: false });
  }

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  logger.log(
    `AIM Command Center API listening on http://localhost:${port}/api`,
  );
}

void bootstrap();

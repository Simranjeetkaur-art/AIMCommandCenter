import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

/**
 * One response shape, and no internal detail on the wire.
 *
 * The audit trigger is the case worth reading: when Postgres refuses an update
 * to audit_events it comes back as a raw query error. That is not a server
 * fault, it is the guarantee working, so it is reported as such.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "Internal server error";
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === "string"
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      /**
       * A thrown exception may name itself.
       *
       * Without this the `code` on a thrown body was silently dropped and
       * every refusal arrived as the bare status name, so a caller could only
       * tell two different 403s apart by matching on English prose. The one
       * that made this matter is PASSWORD_CHANGE_REQUIRED, which the web
       * application has to distinguish from an ordinary permission refusal --
       * one sends the person to the password screen and the other is the
       * matrix doing its job.
       *
       * It lands in `error`, which is already where this filter puts a
       * machine-readable code: UNIQUE_VIOLATION and AUDIT_APPEND_ONLY below
       * are the precedent, and a second field meaning the same thing would be
       * two conventions for one job.
       */
      if (typeof body === "object" && body !== null) {
        const named = (body as { code?: unknown }).code;
        if (typeof named === "string") code = named;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        code = "UNIQUE_VIOLATION";
        message = "That record already exists";
      } else if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        code = "NOT_FOUND";
        message = "Record not found";
      }
    } else if (isAppendOnlyViolation(exception)) {
      status = HttpStatus.FORBIDDEN;
      code = "AUDIT_APPEND_ONLY";
      message = "The audit log is append-only. The database refused the write.";
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      error: code ?? HttpStatus[status],
      message,
      path: request.originalUrl,
      requestId: request.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}

function isAppendOnlyViolation(exception: unknown): boolean {
  const text = (exception as { message?: string })?.message ?? "";
  return text.includes("append-only");
}

import {
  ExecutionContext,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import type { Actor } from "./actor";

export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.actor) {
      throw new UnauthorizedException("No actor on request");
    }
    return request.actor;
  },
);

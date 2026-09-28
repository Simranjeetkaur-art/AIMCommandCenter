import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/auth/public.decorator";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  health() {
    return {
      status: "ok",
      service: "aim-command-center-api",
      time: new Date().toISOString(),
    };
  }
}

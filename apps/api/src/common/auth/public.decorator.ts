import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "aim:public";

/**
 * Marks a route as reachable without a session. Used by exactly two handlers:
 * login, and the health check. Anything else that carries this decorator
 * should be treated as a defect in review.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

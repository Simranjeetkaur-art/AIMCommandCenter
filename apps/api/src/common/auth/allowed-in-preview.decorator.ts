import { SetMetadata } from "@nestjs/common";

export const ALLOWED_IN_PREVIEW = "allowedInPreview";

/**
 * Marks the few routes that still work while a preview is on.
 *
 * A preview refuses everything that is not a read, which would otherwise
 * include the route that ends the preview -- leaving the only way out a
 * sign-out. These are the exceptions, and there are two of them.
 */
export const AllowedInPreview = () => SetMetadata(ALLOWED_IN_PREVIEW, true);

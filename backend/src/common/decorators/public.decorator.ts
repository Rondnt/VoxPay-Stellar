import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca un endpoint como público (ej. `/v1/public/*`), sin pasar por JwtAuthGuard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

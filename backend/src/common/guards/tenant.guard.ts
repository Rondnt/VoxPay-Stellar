import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';

/** Resuelve tenant_id desde el JWT (request.user, seteado por JwtStrategy) y lo expone a los repositorios. */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;

    if (!tenantId) {
      throw new UnauthorizedException('Missing tenant context');
    }

    request.tenantId = tenantId;
    return true;
  }
}

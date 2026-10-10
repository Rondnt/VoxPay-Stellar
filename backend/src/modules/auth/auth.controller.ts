import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // No-op intencional: los JWT propios y los ID tokens de Firebase son stateless, no hay sesión de
  // servidor que invalidar acá. La cookie httpOnly `voxpay_session` vive en el origen del frontend
  // (Cloud Run del backend no podría borrarla aunque quisiera) y se limpia en
  // frontend/src/app/api/firebase-session/route.ts. Este endpoint solo existe para que el cliente
  // tenga una llamada de "logout" que responda 200 de forma predecible.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout() {
    return { ok: true };
  }
}

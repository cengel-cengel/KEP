import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

export type DriverJwtPayload = {
  tourId: string;
  type: 'driver';
};

@Injectable()
export class DriverAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Fahrer-Token fehlt');
    }
    const raw = header.slice(7).trim();
    const secret = this.config.get<string>('JWT_SECRET', 'changeme');
    try {
      const payload = this.jwt.verify(raw, { secret }) as DriverJwtPayload;
      if (payload?.type !== 'driver' || !payload?.tourId) {
        throw new UnauthorizedException('Ungültiger Fahrer-Token');
      }
      (req as Request & { driverTourId: string }).driverTourId =
        payload.tourId;
      return true;
    } catch {
      throw new UnauthorizedException('Ungültiger Fahrer-Token');
    }
  }
}

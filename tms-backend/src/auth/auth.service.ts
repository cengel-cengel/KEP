import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    console.log('LOGIN-DEBUG', {
      emailReceived: email,
      passwordReceivedLength: password?.length,
      passwordReceivedFirstChar: password?.[0],
      userFoundInDb: !!user,
      hashFromDb: user?.password_hash?.substring(0, 7),
      hashFromDbLength: user?.password_hash?.length,
      hashStartsWithBcrypt: user?.password_hash?.startsWith('$2'),
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    console.log('LOGIN-DEBUG-RESULT', { isValid: passwordMatches });

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
    };
  }
}

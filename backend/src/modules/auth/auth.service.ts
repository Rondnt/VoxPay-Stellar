import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';

interface StoredUser {
  tenantId: string;
  passwordHash: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    // MVP: email único por tenant, no globalmente; primer match alcanza para la demo.
    const snapshot = await this.firestore.db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const doc = snapshot.docs[0];
    const user = doc.data() as StoredUser;

    if (!(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwt.signAsync({
      sub: doc.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return { accessToken };
  }
}

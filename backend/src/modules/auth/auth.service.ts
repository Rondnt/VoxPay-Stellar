import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { compare, hash } from 'bcryptjs';
import { getAuth } from 'firebase-admin/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
}

interface StoredUser {
  tenantId: string;
  passwordHash?: string;
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

    if (!user.passwordHash || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwt.signAsync({
      sub: doc.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    return { accessToken };
  }

  /**
   * El Bearer de cada request es o bien un JWT propio (login del backend) o un Firebase ID token
   * (login del frontend vía Firebase Auth — email/password o Google). Ambos llegan por el mismo
   * header; se distinguen decodificando el `iss` del payload, igual que hace el proxy del frontend
   * (`frontend/src/app/api/backend/[...path]/route.ts`) para decidir si reenviarlo tal cual.
   */
  async resolveUser(token: string): Promise<JwtPayload> {
    if (this.isFirebaseToken(token)) {
      return this.resolveFirebaseUser(token);
    }
    try {
      return await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private isFirebaseToken(token: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
        iss?: unknown;
      };
      return (
        typeof payload.iss === 'string' &&
        payload.iss.startsWith('https://securetoken.google.com/')
      );
    } catch {
      return false;
    }
  }

  private async resolveFirebaseUser(token: string): Promise<JwtPayload> {
    const decoded = await getAuth()
      .verifyIdToken(token)
      .catch(() => {
        throw new UnauthorizedException('Invalid Firebase token');
      });

    const existing = await this.firestore.db
      .collection('users')
      .where('firebaseUid', '==', decoded.uid)
      .limit(1)
      .get();

    if (!existing.empty) {
      const user = existing.docs[0].data() as StoredUser;
      return { sub: existing.docs[0].id, tenantId: user.tenantId, role: user.role };
    }

    return this.provisionFirebaseUser(decoded.uid, decoded.email ?? '');
  }

  /**
   * Onboarding automático: la primera vez que un usuario de Firebase llega a la API, le creamos su
   * propio tenant + merchant (patrón estándar de self-serve SaaS). El merchant arranca con un keypair
   * de Stellar generado al azar como placeholder — mismo patrón que `scripts/seed.ts` — hasta que
   * conecte su wallet real vía el flujo de `/v1/merchants/operator/*`.
   */
  private async provisionFirebaseUser(firebaseUid: string, email: string): Promise<JwtPayload> {
    const businessName = email.split('@')[0] || 'Mi negocio';

    const tenantRef = await this.firestore.db.collection('tenants').add({
      name: businessName,
      plan: 'free',
      apiKeyHash: await hash(randomUUID(), 10),
      createdAt: Timestamp.now(),
    });

    const userRef = await this.firestore.db.collection('users').add({
      tenantId: tenantRef.id,
      email,
      firebaseUid,
      role: 'OWNER',
      createdAt: Timestamp.now(),
    });

    await this.firestore.db.collection('merchants').add({
      tenantId: tenantRef.id,
      stellarAddress: Keypair.random().publicKey(),
      operatorAuthorized: false,
      createdAt: Timestamp.now(),
    });

    return { sub: userRef.id, tenantId: tenantRef.id, role: 'OWNER' };
  }
}

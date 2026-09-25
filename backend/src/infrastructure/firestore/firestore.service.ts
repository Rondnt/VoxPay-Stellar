import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Con FIRESTORE_EMULATOR_HOST seteado, el Admin SDK se conecta solo al emulador local sin
 * credenciales; sin esa env var, usa el service account real (producción/staging).
 */
@Injectable()
export class FirestoreService implements OnModuleInit {
  db!: Firestore;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!getApps().length) {
      const projectId = this.config.getOrThrow<string>('FIREBASE_PROJECT_ID');
      const usingEmulator = Boolean(this.config.get<string>('FIRESTORE_EMULATOR_HOST'));

      initializeApp(
        usingEmulator
          ? { projectId }
          : {
              projectId,
              credential: cert(
                JSON.parse(this.config.getOrThrow<string>('FIREBASE_SERVICE_ACCOUNT')),
              ),
            },
      );
    }

    this.db = getFirestore();
  }
}

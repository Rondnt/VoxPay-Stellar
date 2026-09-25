import { Global, Module } from '@nestjs/common';
import { FirestoreService } from './firestore.service.js';

@Global()
@Module({
  providers: [FirestoreService],
  exports: [FirestoreService],
})
export class FirestoreModule {}

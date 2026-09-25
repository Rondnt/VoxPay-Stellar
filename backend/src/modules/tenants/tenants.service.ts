import { Injectable, NotFoundException } from '@nestjs/common';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { timestampToIso } from '../../infrastructure/firestore/firestore.utils.js';

export interface Tenant {
  id: string;
  name: string;
  plan: string;
  apiKeyHash: string;
  createdAt: string;
}

@Injectable()
export class TenantsService {
  constructor(private readonly firestore: FirestoreService) {}

  private get collection() {
    return this.firestore.db.collection('tenants');
  }

  private toEntity(doc: DocumentSnapshot<DocumentData>): Tenant {
    const data = doc.data() as Omit<Tenant, 'id' | 'createdAt'> & { createdAt: Timestamp };
    return { id: doc.id, ...data, createdAt: timestampToIso(data.createdAt) };
  }

  async findByApiKeyHash(apiKeyHash: string): Promise<Tenant | null> {
    const snapshot = await this.collection.where('apiKeyHash', '==', apiKeyHash).limit(1).get();
    return snapshot.empty ? null : this.toEntity(snapshot.docs[0]);
  }

  async findById(id: string): Promise<Tenant> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) throw new NotFoundException('Tenant not found');
    return this.toEntity(doc);
  }

  async create(data: { name: string; apiKeyHash: string; plan?: string }): Promise<Tenant> {
    const ref = await this.collection.add({
      name: data.name,
      apiKeyHash: data.apiKeyHash,
      plan: data.plan ?? 'free',
      createdAt: Timestamp.now(),
    });
    return this.findById(ref.id);
  }
}

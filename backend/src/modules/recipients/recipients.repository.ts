import { Injectable } from '@nestjs/common';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { timestampToIso } from '../../infrastructure/firestore/firestore.utils.js';

export interface Recipient {
  id: string;
  merchantId: string;
  alias: string;
  stellarAddress: string;
  defaultShare: number | null;
  createdAt: string;
}

export interface CreateRecipientData {
  merchantId: string;
  alias: string;
  stellarAddress: string;
  defaultShare?: number;
}

export interface UpdateRecipientData {
  alias?: string;
  stellarAddress?: string;
  defaultShare?: number;
}

@Injectable()
export class RecipientsRepository {
  constructor(private readonly firestore: FirestoreService) {}

  private get collection() {
    return this.firestore.db.collection('recipients');
  }

  private toEntity(doc: DocumentSnapshot<DocumentData>): Recipient {
    const data = doc.data() as Omit<Recipient, 'id' | 'createdAt'> & { createdAt: Timestamp };
    return { id: doc.id, ...data, createdAt: timestampToIso(data.createdAt) };
  }

  async findAllByMerchant(merchantId: string): Promise<Recipient[]> {
    const snapshot = await this.collection.where('merchantId', '==', merchantId).get();
    return snapshot.docs.map((doc) => this.toEntity(doc));
  }

  /** Scoping por merchant: null tanto si no existe como si pertenece a otro merchant. */
  async findOne(id: string, merchantId: string): Promise<Recipient | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    const entity = this.toEntity(doc);
    return entity.merchantId === merchantId ? entity : null;
  }

  /** Doc ID determinístico `${merchantId}_${alias}` → lookup O(1), sin query. */
  async findByAlias(merchantId: string, alias: string): Promise<Recipient | null> {
    const doc = await this.collection.doc(`${merchantId}_${alias}`).get();
    return doc.exists ? this.toEntity(doc) : null;
  }

  /**
   * `.create()` sobre un ID existente tira un error con `code === 6` (gRPC ALREADY_EXISTS) — es la
   * unicidad de `(merchantId, alias)` que antes daba la constraint de Postgres. El caller
   * (RecipientsService) traduce ese código a un 409 de negocio.
   */
  async create(data: CreateRecipientData): Promise<Recipient> {
    const id = `${data.merchantId}_${data.alias}`;
    await this.collection.doc(id).create({
      merchantId: data.merchantId,
      alias: data.alias,
      stellarAddress: data.stellarAddress,
      defaultShare: data.defaultShare ?? null,
      createdAt: Timestamp.now(),
    });
    return (await this.findByAlias(data.merchantId, data.alias)) as Recipient;
  }

  async update(id: string, data: UpdateRecipientData): Promise<Recipient> {
    await this.collection.doc(id).update({ ...data });
    return this.toEntity(await this.collection.doc(id).get());
  }

  async delete(id: string): Promise<void> {
    await this.collection.doc(id).delete();
  }
}

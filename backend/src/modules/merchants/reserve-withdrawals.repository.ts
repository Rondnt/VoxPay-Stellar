import { Injectable } from '@nestjs/common';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { timestampToIso } from '../../infrastructure/firestore/firestore.utils.js';

export interface ReserveWithdrawal {
  id: string;
  merchantId: string;
  amount: string;
  txHash: string;
  createdAt: string;
}

export interface CreateReserveWithdrawalData {
  merchantId: string;
  amount: number;
  txHash: string;
}

@Injectable()
export class ReserveWithdrawalsRepository {
  constructor(private readonly firestore: FirestoreService) {}

  private get collection() {
    return this.firestore.db.collection('reserveWithdrawals');
  }

  private toEntity(doc: DocumentSnapshot<DocumentData>): ReserveWithdrawal {
    const data = doc.data() as Omit<ReserveWithdrawal, 'id' | 'createdAt'> & { createdAt: Timestamp };
    return { id: doc.id, ...data, createdAt: timestampToIso(data.createdAt) };
  }

  async create(data: CreateReserveWithdrawalData): Promise<ReserveWithdrawal> {
    const ref = await this.collection.add({
      merchantId: data.merchantId,
      amount: data.amount.toString(),
      txHash: data.txHash,
      createdAt: Timestamp.now(),
    });
    const doc = await ref.get();
    return this.toEntity(doc);
  }

  /** Más nuevo primero; requiere el índice compuesto `merchantId ASC, createdAt DESC` (ver firestore.indexes.json). */
  async findAllByMerchant(merchantId: string): Promise<ReserveWithdrawal[]> {
    const snapshot = await this.collection
      .where('merchantId', '==', merchantId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => this.toEntity(doc));
  }
}

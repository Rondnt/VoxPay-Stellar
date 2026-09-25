import { ConflictException, Injectable } from '@nestjs/common';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { timestampToIso } from '../../infrastructure/firestore/firestore.utils.js';

export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED';

export interface OrderSplit {
  recipientAlias: string;
  stellarAddress: string;
  amount: number;
}

export interface Order {
  id: string;
  merchantId: string;
  orderRef: string;
  amount: string;
  splitsJson: OrderSplit[];
  status: OrderStatus;
  createTxHash: string | null;
  payTxHash: string | null;
  createdAt: string;
}

export interface CreateOrderData {
  merchantId: string;
  orderRef: string;
  amount: number;
  splitsJson: OrderSplit[];
  status: OrderStatus;
}

export interface UpdateOrderData {
  status?: OrderStatus;
  createTxHash?: string;
  payTxHash?: string;
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly firestore: FirestoreService) {}

  private get collection() {
    return this.firestore.db.collection('orders');
  }

  private toEntity(doc: DocumentSnapshot<DocumentData>): Order {
    const data = doc.data() as Omit<Order, 'id' | 'createdAt'> & { createdAt: Timestamp };
    return { id: doc.id, ...data, createdAt: timestampToIso(data.createdAt) };
  }

  async findById(id: string): Promise<Order | null> {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? this.toEntity(doc) : null;
  }

  /**
   * Sin joins: lee la orden y después el merchant, comparando tenantId en código. `orders` usa
   * auto-ID (opaco, expuesto en /pay/[orderId]) — no se puede componer con el tenant sin romper esa
   * opacidad, a diferencia de `recipients`.
   */
  async findByIdForTenant(id: string, tenantId: string): Promise<Order | null> {
    const order = await this.findById(id);
    if (!order) return null;

    const merchantDoc = await this.firestore.db.collection('merchants').doc(order.merchantId).get();
    if (!merchantDoc.exists || merchantDoc.data()?.tenantId !== tenantId) return null;

    return order;
  }

  async findByMerchantAndRef(merchantId: string, orderRef: string): Promise<Order | null> {
    const snapshot = await this.collection
      .where('merchantId', '==', merchantId)
      .where('orderRef', '==', orderRef)
      .limit(1)
      .get();
    return snapshot.empty ? null : this.toEntity(snapshot.docs[0]);
  }

  /**
   * Auto-ID (nunca compuesto). La unicidad de `(merchantId, orderRef)` no la da el ID del doc como en
   * Recipients, así que se valida con una transacción: leer + escribir atómico. Requiere el índice
   * compuesto `merchantId ASC, orderRef ASC` (ver `firestore.indexes.json`).
   */
  async create(data: CreateOrderData): Promise<Order> {
    const collection = this.collection;
    const id = await this.firestore.db.runTransaction(async (tx) => {
      const dup = await tx.get(
        collection
          .where('merchantId', '==', data.merchantId)
          .where('orderRef', '==', data.orderRef)
          .limit(1),
      );
      if (!dup.empty) {
        throw new ConflictException(`Order ${data.orderRef} already exists for this merchant`);
      }

      const ref = collection.doc();
      tx.set(ref, {
        merchantId: data.merchantId,
        orderRef: data.orderRef,
        amount: data.amount.toString(),
        splitsJson: data.splitsJson,
        status: data.status,
        createTxHash: null,
        payTxHash: null,
        createdAt: Timestamp.now(),
      });
      return ref.id;
    });

    return (await this.findById(id)) as Order;
  }

  async update(id: string, data: UpdateOrderData): Promise<Order> {
    await this.collection.doc(id).update({ ...data });
    return (await this.findById(id)) as Order;
  }

  /**
   * Sin `sum()` nativo porque `amount` se guarda como string (evita imprecisión de punto flotante en
   * el monto real). Requiere el índice compuesto `merchantId ASC, status ASC, createdAt ASC`.
   */
  async sumPaidSince(merchantId: string, since: Date): Promise<{ total: number; count: number }> {
    const snapshot = await this.collection
      .where('merchantId', '==', merchantId)
      .where('status', '==', 'PAID')
      .where('createdAt', '>=', Timestamp.fromDate(since))
      .get();

    let total = 0;
    for (const doc of snapshot.docs) {
      total += Number(doc.data().amount as string);
    }

    return { total, count: snapshot.size };
  }
}

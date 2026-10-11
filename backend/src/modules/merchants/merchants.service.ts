import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { timestampToIso } from '../../infrastructure/firestore/firestore.utils.js';
import { SorobanService } from '../../infrastructure/stellar/soroban.service.js';
import { ReserveWithdrawalsRepository } from './reserve-withdrawals.repository.js';

export interface Merchant {
  id: string;
  tenantId: string;
  stellarAddress: string;
  operatorAuthorized: boolean;
  reservePercentage: number;
  createdAt: string;
}

@Injectable()
export class MerchantsService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly soroban: SorobanService,
    private readonly withdrawals: ReserveWithdrawalsRepository,
  ) {}

  private get collection() {
    return this.firestore.db.collection('merchants');
  }

  private toEntity(doc: DocumentSnapshot<DocumentData>): Merchant {
    const data = doc.data() as Omit<Merchant, 'id' | 'createdAt'> & { createdAt: Timestamp };
    return {
      id: doc.id,
      ...data,
      // Comerciantes creados antes de la reserva automática no tienen este campo en Firestore.
      reservePercentage: data.reservePercentage ?? 0,
      createdAt: timestampToIso(data.createdAt),
    };
  }

  async findByTenant(tenantId: string): Promise<Merchant> {
    const snapshot = await this.collection.where('tenantId', '==', tenantId).limit(1).get();
    if (snapshot.empty) throw new NotFoundException('Merchant not found');
    return this.toEntity(snapshot.docs[0]);
  }

  async findById(id: string): Promise<Merchant> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) throw new NotFoundException('Merchant not found');
    return this.toEntity(doc);
  }

  /**
   * Reemplaza el stellarAddress placeholder (generado al azar en el auto-provisioning, ver
   * auth.service.ts) por la wallet real que el comerciante conectó, o la cambia por otra más
   * adelante. Si ya estaba autorizada, exige saldo reservado en cero (esos fondos solo los puede
   * mover la wallet vieja, vía su propia firma) y resetea operatorAuthorized: el contrato asoció
   * set_operator a la dirección anterior, así que la nueva tiene que volver a autorizar al operador.
   */
  async registerWallet(tenantId: string, stellarAddress: string): Promise<Merchant> {
    if (!StrKey.isValidEd25519PublicKey(stellarAddress)) {
      throw new BadRequestException('La dirección de Stellar no es válida');
    }
    const merchant = await this.findByTenant(tenantId);
    if (merchant.stellarAddress === stellarAddress) {
      return merchant;
    }
    if (merchant.operatorAuthorized) {
      const balance = await this.soroban.getReserveBalance(merchant.stellarAddress);
      if (balance > 0n) {
        throw new ForbiddenException(
          'Retirá el saldo reservado con la wallet actual antes de cambiarla: esos fondos solo los puede mover esa cuenta.',
        );
      }
      await this.collection.doc(merchant.id).update({ stellarAddress, operatorAuthorized: false });
      return this.findById(merchant.id);
    }
    await this.collection.doc(merchant.id).update({ stellarAddress });
    return this.findById(merchant.id);
  }

  /** Arma el XDR sin firmar de set_operator(merchant, operator); lo firma el comerciante con su wallet. */
  async buildOperatorAuthorizationTx(tenantId: string): Promise<string> {
    const merchant = await this.findByTenant(tenantId);
    return this.soroban.buildUnsignedInvocation(merchant.stellarAddress, 'set_operator', {
      merchant: merchant.stellarAddress,
      operator: this.soroban.getOperatorPublicKey(),
    });
  }

  async submitOperatorAuthorization(tenantId: string, signedXdr: string): Promise<{ hash: string }> {
    const merchant = await this.findByTenant(tenantId);
    const result = await this.soroban.submitSignedXdr(signedXdr);
    await this.collection.doc(merchant.id).update({ operatorAuthorized: true });
    return result;
  }

  /** % que se aparta de cada cobro nuevo (ej. reserva para SUNAT); solo afecta órdenes creadas de ahí en más. */
  async setReserveConfig(tenantId: string, reservePercentage: number): Promise<Merchant> {
    const merchant = await this.findByTenant(tenantId);
    await this.collection.doc(merchant.id).update({ reservePercentage });
    return this.findById(merchant.id);
  }

  /** Lectura en vivo on-chain -- el contrato es la única fuente de verdad del saldo retenido. */
  async getReserveBalance(tenantId: string): Promise<number> {
    const merchant = await this.findByTenant(tenantId);
    const balance = await this.soroban.getReserveBalance(merchant.stellarAddress);
    return SorobanService.fromContractAmount(balance);
  }

  /** Arma el XDR sin firmar de withdraw_reserve(merchant, amount); lo firma el comerciante con su wallet. */
  async buildReserveWithdrawTx(tenantId: string, amount: number): Promise<string> {
    const merchant = await this.findByTenant(tenantId);
    return this.soroban.buildUnsignedInvocation(merchant.stellarAddress, 'withdraw_reserve', {
      merchant: merchant.stellarAddress,
      amount: SorobanService.toContractAmount(amount),
    });
  }

  async submitReserveWithdraw(
    tenantId: string,
    amount: number,
    signedXdr: string,
  ): Promise<{ hash: string }> {
    const merchant = await this.findByTenant(tenantId);
    const result = await this.soroban.submitSignedXdr(signedXdr);
    // Solo para mostrar el historial en la UI -- el contrato sigue siendo la única fuente de verdad
    // del saldo; si este registro se perdiera, no afecta los fondos ni el saldo real.
    await this.withdrawals.create({ merchantId: merchant.id, amount, txHash: result.hash });
    return result;
  }

  /** Historial de retiros para mostrar en la UI (fecha, monto, tx) más un total acumulado. */
  async getReserveWithdrawals(
    tenantId: string,
  ): Promise<{ total: number; items: Array<{ amount: string; txHash: string; createdAt: string }> }> {
    const merchant = await this.findByTenant(tenantId);
    const items = await this.withdrawals.findAllByMerchant(merchant.id);
    const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      total,
      items: items.map(({ amount, txHash, createdAt }) => ({ amount, txHash, createdAt })),
    };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { timestampToIso } from '../../infrastructure/firestore/firestore.utils.js';
import { SorobanService } from '../../infrastructure/stellar/soroban.service.js';

export interface Merchant {
  id: string;
  tenantId: string;
  stellarAddress: string;
  operatorAuthorized: boolean;
  createdAt: string;
}

@Injectable()
export class MerchantsService {
  constructor(
    private readonly firestore: FirestoreService,
    private readonly soroban: SorobanService,
  ) {}

  private get collection() {
    return this.firestore.db.collection('merchants');
  }

  private toEntity(doc: DocumentSnapshot<DocumentData>): Merchant {
    const data = doc.data() as Omit<Merchant, 'id' | 'createdAt'> & { createdAt: Timestamp };
    return { id: doc.id, ...data, createdAt: timestampToIso(data.createdAt) };
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
   * auth.service.ts) por la wallet real que el comerciante conectó. Bloqueado una vez que
   * operatorAuthorized es true: el contrato ya asoció esa dirección específica al operador vía
   * set_operator, así que cambiarla después dejaría la DB desincronizada de la cadena.
   */
  async registerWallet(tenantId: string, stellarAddress: string): Promise<Merchant> {
    if (!StrKey.isValidEd25519PublicKey(stellarAddress)) {
      throw new BadRequestException('La dirección de Stellar no es válida');
    }
    const merchant = await this.findByTenant(tenantId);
    if (merchant.operatorAuthorized) {
      throw new ForbiddenException(
        'La wallet de este negocio ya fue autorizada y no se puede cambiar',
      );
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
}

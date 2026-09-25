import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import type { Merchant } from '../merchants/merchants.service.js';
import type { MerchantsService } from '../merchants/merchants.service.js';
import type { Order } from '../orders/orders.repository.js';
import type { OrdersService } from '../orders/orders.service.js';
import { VoiceAgentService } from './voice-agent.service.js';

const merchant: Merchant = {
  id: 'merchant-1',
  tenantId: 'tenant-1',
  stellarAddress: 'GMERCHANT',
  operatorAuthorized: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function buildFirestoreMock(docData: unknown, exists = true) {
  const docRef = {
    get: vi.fn().mockResolvedValue({ exists, data: () => docData }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const collection = { doc: vi.fn().mockReturnValue(docRef) };
  const db = { collection: vi.fn().mockReturnValue(collection) };
  return { firestore: { db } as unknown as FirestoreService, docRef, collection };
}

function buildService(docData: unknown, exists = true) {
  const { firestore, docRef, collection } = buildFirestoreMock(docData, exists);
  const merchants = { findByTenant: vi.fn().mockResolvedValue(merchant) } as unknown as MerchantsService;
  const orders = { createFromIntent: vi.fn() } as unknown as OrdersService;
  const queue = { add: vi.fn() } as unknown as Queue;
  const service = new VoiceAgentService(firestore, merchants, orders, queue);
  return { service, merchants, orders, queue, docRef, collection };
}

describe('VoiceAgentService.confirm', () => {
  it('rejects with NotFoundException when the command does not exist', async () => {
    const { service } = buildService(undefined, false);

    await expect(service.confirm('tenant-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with NotFoundException when the command belongs to another merchant', async () => {
    const { service } = buildService({ merchantId: 'other-merchant', intentJson: {} });

    await expect(service.confirm('tenant-1', 'cmd-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects with BadRequestException when the intent is not a confirmable create_order', async () => {
    const { service } = buildService({
      merchantId: merchant.id,
      intentJson: { intent: 'unknown' },
    });

    await expect(service.confirm('tenant-1', 'cmd-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with BadRequestException when order_ref or amount are missing', async () => {
    const { service } = buildService({
      merchantId: merchant.id,
      intentJson: { intent: 'create_order', order_ref: '52' }, // sin amount
    });

    await expect(service.confirm('tenant-1', 'cmd-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps the stored intent to CreateOrderDto, confirms the command and returns the order', async () => {
    const { service, orders, docRef } = buildService({
      merchantId: merchant.id,
      intentJson: {
        intent: 'create_order',
        order_ref: '52',
        amount: 30,
        splits: [{ recipient_alias: 'José', amount: 3 }],
      },
    });
    const createdOrder = { id: 'order-1' } as Order;
    vi.mocked(orders.createFromIntent).mockResolvedValue(createdOrder);

    const result = await service.confirm('tenant-1', 'cmd-1');

    expect(orders.createFromIntent).toHaveBeenCalledWith(merchant.id, {
      orderRef: '52',
      amount: 30,
      splits: [{ recipientAlias: 'José', amount: 3 }],
    });
    expect(docRef.update).toHaveBeenCalledWith({ status: 'CONFIRMED' });
    expect(result).toBe(createdOrder);
  });
});

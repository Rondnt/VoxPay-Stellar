import { BadRequestException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { MerchantsService } from '../merchants/merchants.service.js';
import type { Recipient, RecipientsRepository } from '../recipients/recipients.repository.js';
import type { Order, OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

function buildRecipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: 'recipient-1',
    merchantId: 'merchant-1',
    alias: 'José',
    stellarAddress: 'GRECIPIENT',
    defaultShare: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    merchantId: 'merchant-1',
    orderRef: '52',
    amount: '30',
    splitsJson: [],
    status: 'PENDING',
    createTxHash: null,
    payTxHash: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildService() {
  const repository = { create: vi.fn() } as unknown as OrdersRepository;
  const recipients = { findByAlias: vi.fn() } as unknown as RecipientsRepository;
  const merchants = { findByTenant: vi.fn() } as unknown as MerchantsService;
  const queue = { add: vi.fn() } as unknown as Queue;
  const service = new OrdersService(repository, recipients, merchants, queue);
  return { service, repository, recipients, merchants, queue };
}

describe('OrdersService.createFromIntent', () => {
  it('rejects with BadRequestException when a recipient alias is unknown', async () => {
    const { service, recipients } = buildService();
    vi.mocked(recipients.findByAlias).mockResolvedValue(null);

    const promise = service.createFromIntent('merchant-1', {
      orderRef: '52',
      amount: 30,
      splits: [{ recipientAlias: 'José', amount: 3 }],
    });

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow('Unknown recipient alias: José');
  });

  it('rejects with BadRequestException when splits exceed the order amount', async () => {
    const { service, recipients } = buildService();
    vi.mocked(recipients.findByAlias).mockResolvedValue(buildRecipient());

    const promise = service.createFromIntent('merchant-1', {
      orderRef: '52',
      amount: 10,
      splits: [{ recipientAlias: 'José', amount: 20 }],
    });

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow('Splits exceed order amount');
  });

  it('resolves recipient aliases, creates the order and enqueues create_order', async () => {
    const { service, repository, recipients, queue } = buildService();
    vi.mocked(recipients.findByAlias).mockResolvedValue(buildRecipient());
    const createdOrder = buildOrder();
    vi.mocked(repository.create).mockResolvedValue(createdOrder);

    const result = await service.createFromIntent('merchant-1', {
      orderRef: '52',
      amount: 30,
      splits: [{ recipientAlias: 'José', amount: 3 }],
    });

    expect(result).toBe(createdOrder);
    expect(repository.create).toHaveBeenCalledWith({
      merchantId: 'merchant-1',
      orderRef: '52',
      amount: 30,
      splitsJson: [{ recipientAlias: 'José', stellarAddress: 'GRECIPIENT', amount: 3 }],
      status: 'PENDING',
    });
    expect(queue.add).toHaveBeenCalledWith('create_order', { orderId: createdOrder.id });
  });
});

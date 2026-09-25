import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SorobanService } from '../../infrastructure/stellar/soroban.service.js';
import type { NotificationsPublisher } from '../notifications/notifications.publisher.js';
import type { Order, OrdersRepository } from '../orders/orders.repository.js';
import { PaymentsService } from './payments.service.js';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    merchantId: 'merchant-1',
    orderRef: '52',
    amount: '30',
    splitsJson: [],
    status: 'PENDING',
    createTxHash: 'create-hash',
    payTxHash: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildService() {
  const orders = { findById: vi.fn(), update: vi.fn() } as unknown as OrdersRepository;
  const soroban = { submitSignedXdr: vi.fn() } as unknown as SorobanService;
  const notifications = { publish: vi.fn() } as unknown as NotificationsPublisher;
  const service = new PaymentsService(orders, soroban, notifications);
  return { service, orders, soroban, notifications };
}

describe('PaymentsService.submitPayment', () => {
  it('rejects with NotFoundException when the order does not exist', async () => {
    const { service, orders, soroban, notifications } = buildService();
    vi.mocked(orders.findById).mockResolvedValue(null);

    await expect(service.submitPayment('missing-order', 'xdr...')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(soroban.submitSignedXdr).not.toHaveBeenCalled();
    expect(notifications.publish).not.toHaveBeenCalled();
  });

  it('submits the XDR, marks the order PAID and publishes order:paid', async () => {
    const { service, orders, soroban, notifications } = buildService();
    const order = buildOrder();
    vi.mocked(orders.findById).mockResolvedValue(order);
    vi.mocked(soroban.submitSignedXdr).mockResolvedValue({ hash: 'pay-hash' });
    vi.mocked(orders.update).mockResolvedValue({ ...order, status: 'PAID', payTxHash: 'pay-hash' });

    const result = await service.submitPayment(order.id, 'signed-xdr');

    expect(result).toEqual({ hash: 'pay-hash' });
    expect(orders.update).toHaveBeenCalledWith(order.id, { status: 'PAID', payTxHash: 'pay-hash' });
    expect(notifications.publish).toHaveBeenCalledWith(order.merchantId, 'order:paid', {
      orderId: order.id,
      orderRef: order.orderRef,
      hash: 'pay-hash',
    });
  });
});

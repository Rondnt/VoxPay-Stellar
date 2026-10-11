import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import type { SorobanService } from '../../infrastructure/stellar/soroban.service.js';
import { MerchantsService } from './merchants.service.js';
import type { ReserveWithdrawalsRepository } from './reserve-withdrawals.repository.js';

const OLD_ADDRESS = 'GAVRC72GFUMCLLO73BWM2XKHMR5REOCXLF4LJ2FIE7EXADEEV6I4HZ23';
const NEW_ADDRESS = 'GBHJSPKUBH6SIVKN7JB25WOOQ4PBJ5HTS6RNO6G5EK7HJI23MFHWWEED';

function buildMerchantData(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant-1',
    stellarAddress: OLD_ADDRESS,
    operatorAuthorized: false,
    reservePercentage: 0,
    createdAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    ...overrides,
  };
}

function buildFirestoreMock(merchantData: Record<string, unknown>, merchantId = 'merchant-1') {
  const docRef = {
    get: vi.fn().mockResolvedValue({ exists: true, id: merchantId, data: () => merchantData }),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const collection = {
    doc: vi.fn().mockReturnValue(docRef),
    where: vi.fn(),
    limit: vi.fn(),
    get: vi.fn(),
  };
  collection.where.mockReturnValue(collection);
  collection.limit.mockReturnValue(collection);
  collection.get.mockResolvedValue({ empty: false, docs: [{ id: merchantId, data: () => merchantData }] });
  const db = { collection: vi.fn().mockReturnValue(collection) };
  return { firestore: { db } as unknown as FirestoreService, docRef, collection };
}

function buildService(merchantData: Record<string, unknown> = {}) {
  const { firestore, docRef, collection } = buildFirestoreMock(buildMerchantData(merchantData));
  const soroban = { getReserveBalance: vi.fn() } as unknown as SorobanService;
  const withdrawals = {} as unknown as ReserveWithdrawalsRepository;
  const service = new MerchantsService(firestore, soroban, withdrawals);
  return { service, docRef, collection, soroban };
}

describe('MerchantsService.registerWallet', () => {
  it('rejects with BadRequestException when the address is not a valid Stellar public key', async () => {
    const { service } = buildService();

    await expect(service.registerWallet('tenant-1', 'not-an-address')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is a no-op when the address matches the one already registered', async () => {
    const { service, docRef, soroban } = buildService({ stellarAddress: OLD_ADDRESS });

    const result = await service.registerWallet('tenant-1', OLD_ADDRESS);

    expect(result.stellarAddress).toBe(OLD_ADDRESS);
    expect(docRef.update).not.toHaveBeenCalled();
    expect(soroban.getReserveBalance).not.toHaveBeenCalled();
  });

  it('updates the address without checking the reserve balance when not yet authorized', async () => {
    const { service, docRef, soroban } = buildService({ operatorAuthorized: false });

    await service.registerWallet('tenant-1', NEW_ADDRESS);

    expect(soroban.getReserveBalance).not.toHaveBeenCalled();
    expect(docRef.update).toHaveBeenCalledWith({ stellarAddress: NEW_ADDRESS });
  });

  it('rejects with ForbiddenException when authorized and the current wallet still holds a reserve balance', async () => {
    const { service, docRef, soroban } = buildService({ operatorAuthorized: true });
    vi.mocked(soroban.getReserveBalance).mockResolvedValue(10_000_000n);

    await expect(service.registerWallet('tenant-1', NEW_ADDRESS)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(docRef.update).not.toHaveBeenCalled();
  });

  it('changes the address and resets operatorAuthorized when authorized and the reserve balance is zero', async () => {
    const { service, docRef, soroban } = buildService({ operatorAuthorized: true });
    vi.mocked(soroban.getReserveBalance).mockResolvedValue(0n);

    await service.registerWallet('tenant-1', NEW_ADDRESS);

    expect(soroban.getReserveBalance).toHaveBeenCalledWith(OLD_ADDRESS);
    expect(docRef.update).toHaveBeenCalledWith({
      stellarAddress: NEW_ADDRESS,
      operatorAuthorized: false,
    });
  });
});

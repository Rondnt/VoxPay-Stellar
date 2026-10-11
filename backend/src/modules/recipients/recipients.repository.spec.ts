import { describe, expect, it, vi } from 'vitest';
import type { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { RecipientsRepository } from './recipients.repository.js';

function buildRepository(allRecipients: Record<string, unknown>[], exactMatch = false) {
  const docRef = {
    get: vi.fn().mockResolvedValue(
      exactMatch
        ? { exists: true, id: 'exact-match', data: () => allRecipients[0] }
        : { exists: false },
    ),
  };
  const collection = {
    doc: vi.fn().mockReturnValue(docRef),
    where: vi.fn(),
    get: vi.fn().mockResolvedValue({
      docs: allRecipients.map((data, i) => ({ id: `recipient-${i}`, data: () => data })),
    }),
  };
  collection.where.mockReturnValue(collection);
  const db = { collection: vi.fn().mockReturnValue(collection) };
  const repository = new RecipientsRepository({ db } as unknown as FirestoreService);
  return { repository, docRef, collection };
}

function buildRecipient(overrides: Record<string, unknown> = {}) {
  return {
    merchantId: 'merchant-1',
    alias: 'José',
    stellarAddress: 'GRECIPIENT',
    defaultShare: null,
    createdAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
    ...overrides,
  };
}

describe('RecipientsRepository.findByAlias', () => {
  it('returns the exact match without scanning all recipients', async () => {
    const { repository, collection } = buildRepository([buildRecipient()], true);

    const result = await repository.findByAlias('merchant-1', 'José');

    expect(result?.alias).toBe('José');
    expect(collection.where).not.toHaveBeenCalled();
  });

  it('falls back to an accent/case-insensitive match when voice transcribes diacritics the merchant omitted', async () => {
    const { repository } = buildRepository([buildRecipient({ alias: 'Jose' })], false);

    const result = await repository.findByAlias('merchant-1', 'José');

    expect(result?.alias).toBe('Jose');
  });

  it('returns null when no recipient matches even after normalizing', async () => {
    const { repository } = buildRepository([buildRecipient({ alias: 'Mateo' })], false);

    const result = await repository.findByAlias('merchant-1', 'José');

    expect(result).toBeNull();
  });
});

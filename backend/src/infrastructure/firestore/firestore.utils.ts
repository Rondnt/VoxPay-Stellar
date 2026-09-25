import type { Timestamp } from 'firebase-admin/firestore';

/** Convención de la API: los timestamps de Firestore se serializan como ISO string en las respuestas. */
export function timestampToIso(timestamp: Timestamp): string {
  return timestamp.toDate().toISOString();
}

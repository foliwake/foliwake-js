// The contract of Foliwake core over HTTP (`/api/rpc/<procedure>`, tRPC's wire without a transformer): which
// procedures a server has, whether each is a query or a mutation, what each takes and answers, and the codes
// of its errors. Generated from the engine's router; a server answers `GET /api/version` with the same digest
// when it speaks exactly this contract. While the API version stays 1, servers change it additively only.
import { PROCEDURES } from './manifest.js';

export type * from './procedures.js';
export { CONTRACT_DIGEST, CORE_API, PROCEDURES } from './manifest.js';
export { ERROR_CATEGORIES, ERROR_CODES } from './errors.js';

/** Whether a procedure is a query or a mutation; undefined when this contract has no such procedure. */
export function procedureType(name: string): 'query' | 'mutation' | undefined {
  return Object.hasOwn(PROCEDURES, name) ? PROCEDURES[name] : undefined;
}

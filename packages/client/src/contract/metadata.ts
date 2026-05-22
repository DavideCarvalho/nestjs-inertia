import type { ContractDef } from './contract.js';

export const CONTRACT_METADATA = Symbol.for('nestjs-inertia:contract');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContract(target: unknown): ContractDef<string, unknown, unknown, unknown> | undefined {
  if (typeof target !== 'function') return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Reflect.getMetadata(CONTRACT_METADATA, target) ?? undefined) as any;
}

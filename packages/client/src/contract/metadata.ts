import type { ContractDef } from './contract.js';

export const CONTRACT_METADATA = Symbol.for('nestjs-inertia:contract');

type AnyContract = ContractDef<string, unknown, unknown, unknown>;

export function getContract(target: unknown): AnyContract | undefined {
  if (typeof target !== 'function') return undefined;
  return (Reflect.getMetadata(CONTRACT_METADATA, target) ?? undefined) as AnyContract | undefined;
}

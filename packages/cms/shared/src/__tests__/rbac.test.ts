/**
 * Tests de las reglas compartidas del RBAC (F2.7b).
 */
import { describe, expect, it } from 'vitest';

import {
  isAssignableRank,
  isRbacBucketName,
  isRbacIdentifier,
  isRbacPathPattern,
} from '../utils/rbac';

describe('isAssignableRank', () => {
  it('solo rangos enteros estrictamente inferiores al propio', () => {
    expect(isAssignableRank(79, 80)).toBe(true);
    expect(isAssignableRank(80, 80)).toBe(false);
    expect(isAssignableRank(95, 80)).toBe(false);
    expect(isAssignableRank(0, 1)).toBe(true);
    expect(isAssignableRank(5, null)).toBe(false);
    expect(isAssignableRank(1.5, 80)).toBe(false);
    expect(isAssignableRank(-1, 80)).toBe(false);
  });
});

describe('identificadores y buckets', () => {
  it('identificador SQL o comodín', () => {
    expect(isRbacIdentifier('demo')).toBe(true);
    expect(isRbacIdentifier('*')).toBe(true);
    expect(isRbacIdentifier('demo.products')).toBe(false);
    expect(isRbacIdentifier('')).toBe(false);
  });

  it('bucket de Storage o comodín', () => {
    expect(isRbacBucketName('invoices-2026')).toBe(true);
    expect(isRbacBucketName('*')).toBe(true);
    expect(isRbacBucketName('Invoices')).toBe(false);
    expect(isRbacBucketName('')).toBe(false);
  });
});

describe('isRbacPathPattern', () => {
  it('acepta patrones relativos y el comodín explícito', () => {
    expect(isRbacPathPattern('*')).toBe(true);
    expect(isRbacPathPattern('team/*')).toBe(true);
    expect(isRbacPathPattern('{{user_id}}/*')).toBe(true);
  });

  it('rechaza vacío, absolutos, `..`, barras invertidas y control', () => {
    expect(isRbacPathPattern('')).toBe(false);
    expect(isRbacPathPattern('/etc/*')).toBe(false);
    expect(isRbacPathPattern('team/../secret/*')).toBe(false);
    expect(isRbacPathPattern('team\\*')).toBe(false);
    expect(isRbacPathPattern('team/\u0000')).toBe(false);
  });
});

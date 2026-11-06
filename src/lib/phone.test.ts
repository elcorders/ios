import { describe, expect, it } from 'vitest';
import { normaliseLkPhone } from './phone';

describe('normaliseLkPhone', () => {
  it.each([
    ['0712345678', '+94712345678'],
    ['071 234 5678', '+94712345678'],
    ['071-234-5678', '+94712345678'],
    ['+94712345678', '+94712345678'],
    ['94712345678', '+94712345678'],
    ['0094712345678', '+94712345678'],
    ['712345678', '+94712345678'],
  ])('%s -> %s', (input, out) => expect(normaliseLkPhone(input)).toBe(out));

  it.each([[''], ['   '], ['0112345678'], ['07123'], ['abc'], ['07123456789']])('rejects %j', (input) => {
    expect(normaliseLkPhone(input)).toBeNull();
  });
  it('handles null/undefined', () => {
    expect(normaliseLkPhone(null)).toBeNull();
    expect(normaliseLkPhone(undefined)).toBeNull();
  });
});

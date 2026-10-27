import { describe, expect, it } from 'vitest';
import { applyRate, formatRate, formatRateInput, parseMoney, parseRateBp, roundDiv } from '../utils/money';

describe('money', () => {
  it('rounds half away from zero', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(roundDiv(4, 3)).toBe(1);
    expect(roundDiv(-4, 3)).toBe(-1);
  });
  it('applies a basis-point rate once', () => {
    expect(applyRate(12_345, 1000)).toBe(1235);
    expect(applyRate(100_000, 1200)).toBe(12_000);
  });
  it('parses what people type', () => {
    expect(parseMoney('1,100')).toBe(110_000);
    expect(parseMoney('$2,200.5')).toBe(220_050);
    expect(parseMoney('£15.05')).toBe(1505);
    expect(parseMoney('-3')).toBe(-300);
    expect(parseMoney('1.234')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('')).toBeNull();
  });
  it('formats rates', () => {
    expect(formatRate(1000)).toBe('10%');
    expect(formatRate(1150)).toBe('11.5%');
    expect(formatRate(1225)).toBe('12.25%');
  });
});

describe('rates', () => {
  it('parses rates into basis points', () => {
    expect(parseRateBp('10')).toBe(1000);
    expect(parseRateBp('10.5')).toBe(1050);
    expect(parseRateBp('10.25%')).toBe(1025);
    expect(parseRateBp(' 0.75 % ')).toBe(75);
    expect(parseRateBp('100')).toBe(10_000);
  });
  it('rejects bad rates', () => {
    expect(parseRateBp('100.01')).toBeNull();
    expect(parseRateBp('10.125')).toBeNull();
    expect(parseRateBp('-1')).toBeNull();
    expect(parseRateBp('')).toBeNull();
    expect(parseRateBp('abc')).toBeNull();
  });
  it('formats basis points for an input box', () => {
    expect(formatRateInput(1000)).toBe('10');
    expect(formatRateInput(1050)).toBe('10.5');
    expect(formatRateInput(1025)).toBe('10.25');
    expect(formatRateInput(75)).toBe('0.75');
    expect(formatRateInput(0)).toBe('0');
  });
});

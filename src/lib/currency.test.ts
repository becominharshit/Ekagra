import { describe, expect, it } from 'vitest'
import {
  currencySymbol,
  defaultCurrencyForLocale,
  formatCurrency,
  formatNumber,
} from './currency'

describe('global currency and number formatting', () => {
  it('formats major currencies cleanly according to currency and locale rules', () => {
    expect(formatCurrency(6000, 'INR')).toBe('₹6,000')
    expect(formatCurrency(150_000, 'INR')).toBe('₹1,50,000')
    expect(formatCurrency(1200, 'USD', 'en-US')).toBe('$1,200')
    expect(formatCurrency(19.99, 'USD', 'en-US', { maximumFractionDigits: 2 })).toBe('$19.99')
    expect(formatCurrency(15, 'GBP', 'en-GB')).toBe('£15')
  })

  it('infers sensible default currency from regional locale', () => {
    expect(defaultCurrencyForLocale('en-US')).toBe('USD')
    expect(defaultCurrencyForLocale('en-GB')).toBe('GBP')
    expect(defaultCurrencyForLocale('de-DE')).toBe('EUR')
    expect(defaultCurrencyForLocale('en-IN')).toBe('INR')
    expect(defaultCurrencyForLocale('ja-JP')).toBe('JPY')
  })

  it('extracts currency symbols and formats numbers with locale', () => {
    expect(currencySymbol('USD', 'en-US')).toBe('$')
    expect(currencySymbol('EUR', 'en-IE')).toBe('€')
    expect(currencySymbol('GBP', 'en-GB')).toBe('£')
    expect(currencySymbol('INR', 'en-IN')).toBe('₹')
    expect(formatNumber(123456, 'en-US')).toBe('123,456')
  })
})

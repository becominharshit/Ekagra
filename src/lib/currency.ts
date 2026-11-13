export interface CurrencyOption {
  code: string
  label: string
  defaultLocale: string
}

export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { code: 'USD', label: 'USD ($) — United States', defaultLocale: 'en-US' },
  { code: 'EUR', label: 'EUR (€) — Europe', defaultLocale: 'en-IE' },
  { code: 'GBP', label: 'GBP (£) — United Kingdom', defaultLocale: 'en-GB' },
  { code: 'INR', label: 'INR (₹) — India', defaultLocale: 'en-IN' },
  { code: 'CAD', label: 'CAD (CA$) — Canada', defaultLocale: 'en-CA' },
  { code: 'AUD', label: 'AUD (A$) — Australia', defaultLocale: 'en-AU' },
  { code: 'SGD', label: 'SGD (S$) — Singapore', defaultLocale: 'en-SG' },
  { code: 'JPY', label: 'JPY (¥) — Japan', defaultLocale: 'ja-JP' },
]

export function browserLocale(): string {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language
    }
  } catch {
    // Non-browser environment.
  }
  return 'en-US'
}

export function defaultCurrencyForLocale(locale = browserLocale()): string {
  const upper = locale.toUpperCase()
  if (upper.endsWith('-IN') || upper === 'HI' || upper === 'EN-IN') return 'INR'
  if (upper.endsWith('-GB')) return 'GBP'
  if (upper.endsWith('-CA')) return 'CAD'
  if (upper.endsWith('-AU')) return 'AUD'
  if (upper.endsWith('-SG')) return 'SGD'
  if (upper.endsWith('-JP') || upper === 'JA') return 'JPY'
  if (
    upper.endsWith('-DE') ||
    upper.endsWith('-FR') ||
    upper.endsWith('-ES') ||
    upper.endsWith('-IT') ||
    upper.endsWith('-NL') ||
    upper.endsWith('-IE')
  ) {
    return 'EUR'
  }
  return 'USD'
}

export function localeForCurrency(currency: string, explicitLocale?: string): string {
  if (explicitLocale) return explicitLocale
  const match = SUPPORTED_CURRENCIES.find((item) => item.code === currency.toUpperCase())
  if (match) return match.defaultLocale
  return browserLocale()
}

export function formatCurrency(
  amount: number,
  currency?: string | null,
  locale?: string,
  options?: { maximumFractionDigits?: number },
): string {
  const code = (currency || defaultCurrencyForLocale(locale)).toUpperCase()
  const resolvedLocale = localeForCurrency(code, locale)
  const maximumFractionDigits = options?.maximumFractionDigits ?? (code === 'JPY' || code === 'INR' ? 0 : Number.isInteger(amount) ? 0 : 2)
  try {
    return new Intl.NumberFormat(resolvedLocale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits,
    }).format(amount)
  } catch {
    return `${code} ${Math.round(amount).toLocaleString(resolvedLocale)}`
  }
}

export function currencySymbol(currency?: string | null, locale?: string): string {
  const code = (currency || defaultCurrencyForLocale(locale)).toUpperCase()
  const resolvedLocale = localeForCurrency(code, locale)
  try {
    const parts = new Intl.NumberFormat(resolvedLocale, { style: 'currency', currency: code }).formatToParts(0)
    return parts.find((part) => part.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

export function formatNumber(value: number, locale = browserLocale()): string {
  try {
    return new Intl.NumberFormat(locale).format(value)
  } catch {
    return String(value)
  }
}

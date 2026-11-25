export function formatters(locale: string, currency?: string) {
  let safeLocale = locale
  try { Intl.getCanonicalLocales(locale) } catch { safeLocale = 'en' }
  const dates = new Intl.DateTimeFormat(safeLocale, { dateStyle: 'medium', timeZone: 'UTC' })
  const date = (value?: string) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
    const parsed = new Date(value + 'T00:00:00Z')
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? value : dates.format(parsed)
  }
  function decimal(value?: string, code?: string) {
    if (value === undefined || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return value
    const [whole, fraction = ''] = value.replace(/^[+-]/, '').split('.')
    const integers = BigInt(whole || '0')
    // Use an integer template for grouping, sign, and currency placement. Insert
    // the source fractional digits so even high-precision unit prices stay exact.
    const negative = value.startsWith('-')
    const signed = negative ? (integers === 0n ? -0 : -integers) : integers
    const style: Intl.NumberFormatOptions = code && /^[a-z]{3}$/i.test(code) ? { style: 'currency', currency: code } : {}
    const formatter = new Intl.NumberFormat(safeLocale, style)
    const minimum = formatter.resolvedOptions().minimumFractionDigits ?? 0
    const digits = fraction.padEnd(minimum, '0')
    const digitFormatter = new Intl.NumberFormat(safeLocale, { useGrouping: false })
    const localized = Array.from(digits, digit => digitFormatter.format(BigInt(digit))).join('')
    if (!digits) return new Intl.NumberFormat(safeLocale, { ...style, maximumFractionDigits: 0 }).format(signed)
    return new Intl.NumberFormat(safeLocale, { ...style, minimumFractionDigits: 1, maximumFractionDigits: 1 })
      .formatToParts(signed).map(part => part.type === 'fraction' ? localized : part.value).join('')
  }
  return { date, decimal, amount: (value?: string, code = currency) => decimal(value, code) }
}

export function paymentReference(reference?: string) {
  if (!reference || !/^\d{12}$/.test(reference)) return reference
  const digits = reference.slice(0, 10)
  const check = Number(BigInt(digits) % 97n) || 97
  return check === Number(reference.slice(10)) ?
    '+++' + reference.slice(0, 3) + '/' + reference.slice(3, 7) + '/' + reference.slice(7) + '+++' : reference
}

export function groupIban(account?: string) {
  const compact = account?.replace(/\s/g, '')
  return compact && /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(compact)
    ? compact.match(/.{1,4}/g)?.join(' ') : account
}

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { MAX_XML_BYTES, parseUbl } from './parseUbl'
import { formatters, groupIban, paymentReference } from './format'

const fixtures = import.meta.glob<string>('../fixtures/*/*.xml', { eager: true, query: '?raw', import: 'default' })
const fixture = (path: string) => fixtures['../fixtures/' + path + '.xml']
function parsed(path: string) {
  const result = parseUbl(fixture(path))
  if (!result.ok) throw new Error(path + ' failed to parse: ' + result.error)
  return result
}

describe('official OpenPeppol examples', () => {
  it.each([
    ['Allowance-example', 'invoice', 'Snippet1', '6125.00', 3, 'S'],
    ['Vat-category-S', 'invoice', 'Snippet1', '8550', 3, 'S'],
    ['base-creditnote-correction', 'creditNote', 'Snippet1', '1656.25', 2, 'S'],
    ['base-example', 'invoice', 'Snippet1', '1656.25', 2, 'S'],
    ['base-negative-inv-correction', 'invoice', 'Correction1', '-1656.25', 2, 'S'],
    ['sales-order-example', 'invoice', 'Snippet1', '1656.25', 2, 'S'],
    ['vat-category-E', 'invoice', 'Vat-Z', '1200.00', 1, 'E'],
    ['vat-category-O', 'invoice', 'Vat-O', '3200.00', 1, 'O'],
    ['vat-category-Z', 'invoice', 'Vat-Z', '1200.00', 1, 'Z'],
  ])('%s', (file, kind, number, payable, count, vat) => {
    const { invoice } = parsed('official/' + file)
    expect(invoice).toMatchObject({ kind, number, totals: { payable }, taxes: [{ category: vat }, ...invoice.taxes.slice(1)] })
    expect(invoice.lines).toHaveLength(count)
  })
})

it('reads the official invoice header, parties, delivery, payment, lines and stated tax', () => {
  expect(parsed('official/base-example').invoice).toMatchObject({
    issueDate: '2017-11-13', dueDate: '2017-12-01', typeCode: '380', currency: 'EUR', buyerReference: '0150abc',
    seller: {
      name: 'SupplierOfficialName Ltd', tradingName: 'SupplierTradingName Ltd.', vatNumber: 'GB1232434',
      address: { street: 'Main street 1', city: 'London', postalCode: 'GB 123 EW', country: 'GB' },
    },
    buyer: {
      registration: { value: '39937423947', scheme: '0183' },
      contact: { name: 'Lisa Johnson', phone: '23434234', email: 'lj@buyer.se' },
    },
    delivery: { date: '2017-11-01', address: { street: 'Delivery street 2' } },
    payments: [{ means: '30', accountId: 'IBAN32423940', accountName: 'AccountName', bic: 'BIC324098', reference: 'Snippet1' }],
    paymentTerms: ['Payment within 10 days, 2% discount'],
    adjustments: [{ charge: true, amount: '25', reason: 'Insurance' }],
    taxTotals: [{ amount: '331.25', currency: 'EUR' }],
    lines: [
      { name: 'item name', description: 'Description of item', quantity: '7', unit: 'DAY', unitPrice: '400', netAmount: '2800', vatRate: '25.0' },
      { name: 'item name 2', quantity: '-3', netAmount: '-1500' },
    ],
  })
})

describe('edge cases', () => {
  it('extracts a credit note type and credited quantity', () => {
    expect(parsed('edge/credit-note').invoice).toMatchObject({
      kind: 'creditNote', number: 'CN-42', typeCode: '381',
      lines: [{ name: 'Returned books', quantity: '2.00', unit: 'C62', netAmount: '25.00' }],
    })
  })
  it('unwraps SBDH and identifies namespace URIs independently of prefixes', () => {
    expect(parsed('edge/sbdh').invoice).toMatchObject({ number: 'WRAPPED-1', issueDate: '2026-11-20' })
    expect(parsed('edge/custom-prefixes').invoice).toMatchObject({ number: 'PREFIX-1', buyerReference: 'BUY-19' })
  })
  it('extracts attachment metadata, payload and external URIs', () => {
    const { attachments } = parsed('edge/embedded-pdf').invoice
    expect(attachments).toMatchObject([
      { id: 'supporting-pdf', description: 'Supporting document', embedded: { mime: 'application/pdf', filename: 'support.pdf' } },
      { uri: 'https://example.test/support.pdf' }, { uri: 'javascript:alert(1)' },
    ])
    expect(atob(attachments[0].embedded!.base64)).toMatch(/^%PDF-1\.4/)
  })
  it('extracts exemption reasons and distinct rates with decimal strings', () => {
    expect(parsed('edge/reverse-charge').invoice.taxes).toMatchObject([{
      category: 'AE', rate: '0', taxableAmount: '400.00', taxAmount: '0.00',
      exemptionCode: 'VATEX-EU-AE', exemptionReason: 'Reverse charge',
    }])
    expect(parsed('edge/multiple-vat').invoice.taxes).toMatchObject([
      { category: 'S', rate: '6', taxableAmount: '100.00', taxAmount: '6.00' },
      { category: 'S', rate: '21', taxableAmount: '200.00', taxAmount: '42.00' },
    ])
  })
  it('extracts document-level allowance details and stated totals', () => {
    expect(parsed('edge/document-allowance').invoice).toMatchObject({
      adjustments: [{ charge: false, amount: '10.00', baseAmount: '100.00', percentage: '10', reason: 'Volume discount', vatCategory: 'S', vatRate: '21' }],
      totals: { allowances: '10.00', payable: '108.90' },
    })
  })
  it('allows missing optional blocks and warns for missing required fields', () => {
    const result = parsed('edge/missing-optional')
    expect(result.warnings).toEqual([])
    expect(result.invoice).toMatchObject({
      number: 'MIN-1', seller: { endpoint: { scheme: '0208', value: '0123456749' } },
      notes: [], payments: [], attachments: [], totals: { payable: '0.00' },
    })
    expect(result.invoice.delivery).toBeUndefined()
    expect(parsed('edge/credit-note').warnings).toContainEqual({ field: 'sellerName', line: undefined })
  })
  it('rejects malformed XML, foreign roots, DOCTYPE and oversized input', () => {
    expect(parseUbl(fixture('edge/malformed'))).toEqual({ ok: false, error: 'malformedXml' })
    expect(parseUbl('<Invoice/>')).toEqual({ ok: false, error: 'unsupportedDocument' })
    expect(parseUbl('<!DOCTYPE doc [<!ENTITY sample "secret">]><doc>&sample;</doc>')).toEqual({ ok: false, error: 'doctype' })
    expect(parseUbl('é'.repeat(MAX_XML_BYTES / 2 + 1))).toEqual({ ok: false, error: 'tooLarge' })
    expect(parseUbl('<!-- <!DOCTYPE doc> -->' + fixture('edge/custom-prefixes')).ok).toBe(true)
  })
  it('formats decimals and payment identifiers without changing their value', () => {
    expect(formatters('en-GB', 'EUR').amount('9007199254740993.123456789')).toBe('€9,007,199,254,740,993.123456789')
    expect(formatters('nl-BE', 'EUR').amount('-0.001')).toContain('-0,001')
    expect(paymentReference('123456789002')).toBe('+++123/4567/89002+++')
    expect(paymentReference('123456789012')).toBe('123456789012')
    expect(paymentReference('000000000097')).toBe('+++000/0000/00097+++')
    expect(groupIban('BE68539007547034')).toBe('BE68 5390 0754 7034')
  })
})

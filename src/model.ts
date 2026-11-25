export type Decimal = string

export interface Identifier { value: string; scheme?: string }
export interface Period { start?: string; end?: string }
export interface Address {
  street?: string
  additionalStreet?: string
  line?: string
  city?: string
  postalCode?: string
  region?: string
  country?: string
}
export interface Party {
  name?: string
  tradingName?: string
  address?: Address
  vatNumber?: string
  registration?: Identifier
  endpoint?: Identifier
  contact?: { name?: string; phone?: string; email?: string }
}
export interface Adjustment {
  charge?: boolean
  amount?: Decimal
  baseAmount?: Decimal
  percentage?: Decimal
  reason?: string
  reasonCode?: string
  vatCategory?: string
  vatRate?: Decimal
}
export interface InvoiceLine {
  id?: string
  name?: string
  description?: string
  quantity?: Decimal
  unit?: string
  unitPrice?: Decimal
  baseQuantity?: Decimal
  baseUnit?: string
  netAmount?: Decimal
  vatCategory?: string
  vatRate?: Decimal
  sellerItemId?: string
  adjustments: Adjustment[]
  period?: Period
}
export interface TaxBreakdown {
  category?: string
  rate?: Decimal
  taxableAmount?: Decimal
  taxAmount?: Decimal
  exemptionReason?: string
  exemptionCode?: string
  currency?: string
}
export interface Payment {
  means?: string
  accountId?: string
  bic?: string
  accountName?: string
  reference?: string
}
export interface InvoiceTotals {
  lineExtension?: Decimal
  taxExclusive?: Decimal
  taxInclusive?: Decimal
  allowances?: Decimal
  charges?: Decimal
  prepaid?: Decimal
  rounding?: Decimal
  payable?: Decimal
}
export interface Attachment {
  id?: string
  description?: string
  embedded?: { base64: string; filename?: string; mime?: string }
  uri?: string
}
export interface EInvoice {
  kind: 'invoice' | 'creditNote'
  number?: string
  issueDate?: string
  dueDate?: string
  typeCode?: string
  currency?: string
  buyerReference?: string
  orderReference?: string
  contractReference?: string
  period?: Period
  notes: string[]
  seller?: Party
  buyer?: Party
  delivery?: { date?: string; address?: Address }
  payments: Payment[]
  paymentTerms: string[]
  lines: InvoiceLine[]
  adjustments: Adjustment[]
  taxes: TaxBreakdown[]
  taxTotals?: { amount: Decimal; currency?: string }[]
  totals: InvoiceTotals
  attachments: Attachment[]
}
export type ParseError = 'malformedXml' | 'unsupportedDocument' | 'doctype' | 'tooLarge'
export type ParseWarning =
  | { field: string; line?: number }
  | { code: 'unexpectedSpecification' | 'unexpectedProfile' | 'unexpectedUblVersion'; value: string }
export type ParseResult =
  | { ok: true; invoice: EInvoice; warnings: ParseWarning[] }
  | { ok: false; error: ParseError }

import type { Adjustment, EInvoice, ParseResult, ParseWarning } from './model'

export const MAX_XML_BYTES = 10 * 1024 * 1024
const ubl = 'urn:oasis:names:specification:ubl:schema:xsd:'
const basic = ubl + 'CommonBasicComponents-2'
const aggregate = ubl + 'CommonAggregateComponents-2'
const envelope = 'http://www.unece.org/cefact/namespaces/StandardBusinessDocumentHeader'

function matches(element: Element, namespace: string, name: string) {
  return element.namespaceURI === namespace && element.localName === name
}
function children(parent: Element | undefined, ns: string, name: string) {
  return Array.from(parent?.children ?? []).filter(element => matches(element, ns, name))
}
const all = (parent: Element | undefined, name: string) => children(parent, aggregate, name)
const group = (parent: Element | undefined, name: string) => all(parent, name)[0]
const element = (parent: Element | undefined, name: string) => children(parent, basic, name)[0]
const text = (node?: Element) => node?.textContent?.trim() || undefined
const value = (parent: Element | undefined, name: string) => text(element(parent, name))
const values = (parent: Element, name: string) =>
  children(parent, basic, name).map(text).filter((item): item is string => item !== undefined)
const attr = (node: Element | undefined, name: string) => node?.getAttribute(name) || undefined

function identifier(node?: Element) {
  const id = text(node)
  return id ? { value: id, scheme: attr(node, 'schemeID') } : undefined
}
function period(parent?: Element) {
  return parent && { start: value(parent, 'StartDate'), end: value(parent, 'EndDate') }
}
function address(node?: Element) {
  return node && {
    street: value(node, 'StreetName'),
    additionalStreet: value(node, 'AdditionalStreetName'),
    line: value(group(node, 'AddressLine'), 'Line'),
    city: value(node, 'CityName'),
    postalCode: value(node, 'PostalZone'),
    region: value(node, 'CountrySubentity'),
    country: value(group(node, 'Country'), 'IdentificationCode'),
  }
}
function party(node?: Element) {
  if (!node) return undefined
  const legal = group(node, 'PartyLegalEntity')
  const contact = group(node, 'Contact')
  const vat = all(node, 'PartyTaxScheme').find(scheme => value(group(scheme, 'TaxScheme'), 'ID')?.toUpperCase() === 'VAT')
  return {
    name: value(legal, 'RegistrationName'),
    tradingName: value(group(node, 'PartyName'), 'Name'),
    vatNumber: value(vat, 'CompanyID'),
    registration: identifier(element(legal, 'CompanyID')),
    endpoint: identifier(element(node, 'EndpointID')),
    address: address(group(node, 'PostalAddress')),
    contact: contact && {
      name: value(contact, 'Name'), phone: value(contact, 'Telephone'), email: value(contact, 'ElectronicMail'),
    },
  }
}
function adjustments(node: Element): Adjustment[] {
  return all(node, 'AllowanceCharge').map(entry => {
    const indicator = value(entry, 'ChargeIndicator')
    const tax = group(entry, 'TaxCategory')
    return {
      charge: indicator === undefined ? undefined : indicator === 'true' || indicator === '1',
      amount: value(entry, 'Amount'), baseAmount: value(entry, 'BaseAmount'),
      percentage: value(entry, 'MultiplierFactorNumeric'), reason: value(entry, 'AllowanceChargeReason'),
      reasonCode: value(entry, 'AllowanceChargeReasonCode'),
      vatCategory: value(tax, 'ID'), vatRate: value(tax, 'Percent'),
    }
  })
}
function documentKind(root: Element) {
  if (matches(root, ubl + 'Invoice-2', 'Invoice')) return 'invoice'
  if (matches(root, ubl + 'CreditNote-2', 'CreditNote')) return 'creditNote'
}

function extract(root: Element, kind: EInvoice['kind']): EInvoice {
  const credit = kind === 'creditNote'
  const totals = group(root, 'LegalMonetaryTotal')
  const delivery = group(root, 'Delivery')
  const taxTotals = all(root, 'TaxTotal')
  return {
    kind, number: value(root, 'ID'), issueDate: value(root, 'IssueDate'),
    dueDate: value(root, 'DueDate') ?? value(group(root, 'PaymentMeans'), 'PaymentDueDate'),
    typeCode: value(root, credit ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'),
    currency: value(root, 'DocumentCurrencyCode'), buyerReference: value(root, 'BuyerReference'),
    orderReference: value(group(root, 'OrderReference'), 'ID'),
    contractReference: value(group(root, 'ContractDocumentReference'), 'ID'),
    period: period(group(root, 'InvoicePeriod')), notes: values(root, 'Note'),
    seller: party(group(group(root, 'AccountingSupplierParty'), 'Party')),
    buyer: party(group(group(root, 'AccountingCustomerParty'), 'Party')),
    delivery: delivery && {
      date: value(delivery, 'ActualDeliveryDate'),
      address: address(group(group(delivery, 'DeliveryLocation'), 'Address') ?? group(delivery, 'DeliveryAddress')),
    },
    payments: all(root, 'PaymentMeans').map(payment => {
      const account = group(payment, 'PayeeFinancialAccount')
      return {
        means: value(payment, 'PaymentMeansCode'), accountId: value(account, 'ID'),
        accountName: value(account, 'Name'), reference: value(payment, 'PaymentID'),
        bic: value(group(account, 'FinancialInstitutionBranch'), 'ID'),
      }
    }),
    paymentTerms: all(root, 'PaymentTerms').flatMap(terms => values(terms, 'Note')),
    lines: all(root, credit ? 'CreditNoteLine' : 'InvoiceLine').map(line => {
      const quantity = element(line, credit ? 'CreditedQuantity' : 'InvoicedQuantity')
      const item = group(line, 'Item')
      const tax = group(item, 'ClassifiedTaxCategory')
      const price = group(line, 'Price')
      const base = element(price, 'BaseQuantity')
      return {
        id: value(line, 'ID'), name: value(item, 'Name'), description: value(item, 'Description'),
        quantity: text(quantity), unit: attr(quantity, 'unitCode'), unitPrice: value(price, 'PriceAmount'),
        baseQuantity: text(base), baseUnit: attr(base, 'unitCode'), netAmount: value(line, 'LineExtensionAmount'),
        vatCategory: value(tax, 'ID'), vatRate: value(tax, 'Percent'),
        sellerItemId: value(group(item, 'SellersItemIdentification'), 'ID'),
        adjustments: adjustments(line), period: period(group(line, 'InvoicePeriod')),
      }
    }),
    adjustments: adjustments(root),
    taxTotals: taxTotals.flatMap(total => {
      const node = element(total, 'TaxAmount')
      const amount = text(node)
      return amount ? [{ amount, currency: attr(node, 'currencyID') }] : []
    }),
    taxes: taxTotals.flatMap(total => all(total, 'TaxSubtotal').map(subtotal => {
      const category = group(subtotal, 'TaxCategory')
      return {
        category: value(category, 'ID'), rate: value(category, 'Percent'),
        taxableAmount: value(subtotal, 'TaxableAmount'), taxAmount: value(subtotal, 'TaxAmount'),
        currency: attr(element(subtotal, 'TaxAmount'), 'currencyID'),
        exemptionReason: value(category, 'TaxExemptionReason'),
        exemptionCode: value(category, 'TaxExemptionReasonCode'),
      }
    })),
    totals: {
      lineExtension: value(totals, 'LineExtensionAmount'), taxExclusive: value(totals, 'TaxExclusiveAmount'),
      taxInclusive: value(totals, 'TaxInclusiveAmount'), allowances: value(totals, 'AllowanceTotalAmount'),
      charges: value(totals, 'ChargeTotalAmount'), prepaid: value(totals, 'PrepaidAmount'),
      rounding: value(totals, 'PayableRoundingAmount'), payable: value(totals, 'PayableAmount'),
    },
    attachments: all(root, 'AdditionalDocumentReference').map(reference => {
      const attachment = group(reference, 'Attachment')
      const binary = element(attachment, 'EmbeddedDocumentBinaryObject')
      const base64 = text(binary)
      return {
        id: value(reference, 'ID'), description: value(reference, 'DocumentDescription'),
        embedded: base64 ? { base64, filename: attr(binary, 'filename'), mime: attr(binary, 'mimeCode') } : undefined,
        uri: value(group(attachment, 'ExternalReference'), 'URI'),
      }
    }),
  }
}

export function parseUbl(xml: string): ParseResult {
  try {
    if (xml.length > MAX_XML_BYTES || new TextEncoder().encode(xml).length > MAX_XML_BYTES) {
      return { ok: false, error: 'tooLarge' }
    }
    // Ignore comment and CDATA contents when detecting a declaration.
    if (/<!DOCTYPE/.test(xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g, ''))) {
      return { ok: false, error: 'doctype' }
    }
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    if (document.doctype) return { ok: false, error: 'doctype' }
    let root: Element | null = document.documentElement
    if (!root || document.getElementsByTagNameNS('http://www.mozilla.org/newlayout/xml/parsererror.xml', 'parsererror').length) {
      return { ok: false, error: 'malformedXml' }
    }
    if (matches(root, envelope, 'StandardBusinessDocument')) {
      const payload = Array.from(root.children).find(documentKind)
      if (!payload) return { ok: false, error: 'unsupportedDocument' }
      root = payload
    }
    const kind = documentKind(root)
    if (!kind) return { ok: false, error: 'unsupportedDocument' }
    const invoice = extract(root, kind)
    const warnings: ParseWarning[] = []
    const required = (fields: Record<string, unknown>, line?: number) => {
      for (const [field, content] of Object.entries(fields)) {
        if (!content) warnings.push({ field, line })
      }
    }
    required({
      number: invoice.number, issueDate: invoice.issueDate, typeCode: invoice.typeCode,
      currency: invoice.currency, customization: value(root, 'CustomizationID'),
      profile: value(root, 'ProfileID'), sellerName: invoice.seller?.name,
      buyerName: invoice.buyer?.name, sellerEndpoint: invoice.seller?.endpoint,
      buyerEndpoint: invoice.buyer?.endpoint, sellerCountry: invoice.seller?.address?.country,
      buyerCountry: invoice.buyer?.address?.country, lineExtension: invoice.totals.lineExtension,
      taxExclusive: invoice.totals.taxExclusive, taxInclusive: invoice.totals.taxInclusive,
      payable: invoice.totals.payable, items: invoice.lines.length, vat: invoice.taxes.length,
      taxTotal: invoice.taxTotals?.length,
      buyerRef: invoice.buyerReference ?? invoice.orderReference,
    })
    if (invoice.seller?.endpoint && !invoice.seller.endpoint.scheme) required({ endpointScheme: undefined })
    if (invoice.buyer?.endpoint && !invoice.buyer.endpoint.scheme) required({ endpointScheme: undefined })
    invoice.taxes.forEach(tax => required({
      vatCategory: tax.category, taxable: tax.taxableAmount, taxAmount: tax.taxAmount,
    }))
    invoice.lines.forEach((line, index) => required({
      lineId: line.id, item: line.name, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice,
      netAmount: line.netAmount, vatCategory: line.vatCategory,
    }, index + 1))
    return { ok: true, invoice, warnings }
  } catch {
    return { ok: false, error: 'malformedXml' }
  }
}

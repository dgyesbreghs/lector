import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AttachmentRow } from './Attachments'
import { formatters, groupIban, paymentReference } from './format'
import { translator } from './i18n'
import type { Address, Adjustment, EInvoice, Identifier, InvoiceTotals, Party, Period } from './model'
import { MAX_XML_BYTES, parseUbl } from './parseUbl'
import './styles.css'

export type PeppolInvoiceViewerProps = { locale: string } & (
  | { xml: string; invoice?: never }
  | { invoice: EInvoice; xml?: never }
)

type Translate = ReturnType<typeof translator>
type Entry = [string, ReactNode]

function Fields({ entries }: { entries: Entry[] }) {
  const present = entries.filter(([, value]) => value !== undefined && value !== null && value !== '')
  if (!present.length) return null
  return <dl className="fields">{present.map(([label, value], index) =>
    <div key={index}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function AddressBlock({ address }: { address?: Address }) {
  if (!address) return null
  const lines = [address.street, address.additionalStreet, address.line,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    [address.region, address.country].filter(Boolean).join(' · ')].filter(Boolean)
  return <div className="address">{lines.map((line, index) => <div key={index}>{line}</div>)}</div>
}

function identifier(t: Translate, id?: Identifier) {
  return id?.scheme ? id.value + ' · ' + t('scheme.' + id.scheme, id.scheme) : id?.value
}
function PartyBlock({ title, party, t }: { title: string; party?: Party; t: Translate }) {
  return <section className="party">
    <h2>{title}</h2>
    <strong className="party-name">{party?.name ?? party?.tradingName}</strong>
    <AddressBlock address={party?.address} />
    <Fields entries={[
      [t('trading'), party?.name !== party?.tradingName ? party?.tradingName : undefined],
      [t('vatNumber'), party?.vatNumber], [t('registration'), identifier(t, party?.registration)],
      [t('endpoint'), identifier(t, party?.endpoint)], [t('contact'), party?.contact?.name],
      [t('phone'), party?.contact?.phone], [t('email'), party?.contact?.email],
    ]} />
  </section>
}
function periodLabel(period: Period | undefined, date: ReturnType<typeof formatters>['date'], t: Translate) {
  const start = date(period?.start)
  const end = date(period?.end)
  if (start && end) return start + ' – ' + end
  if (start) return t('from') + ' ' + start
  if (end) return t('until') + ' ' + end
}

function XmlSource({ xml, label }: { xml: string; label: string }) {
  const [open, setOpen] = useState(false)
  return <details className="raw-xml no-print" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{label}</summary>{open && <pre>{xml}</pre>}
  </details>
}

const totalKeys: (keyof InvoiceTotals)[] = [
  'lineExtension', 'allowances', 'charges', 'taxExclusive', 'taxInclusive', 'prepaid', 'rounding',
]

export function PeppolInvoiceViewer({ xml, invoice, locale }: PeppolInvoiceViewerProps) {
  const result = useMemo(() => xml && (xml.length > MAX_XML_BYTES || xml.trim()) ? parseUbl(xml) : undefined, [xml])
  const t = translator(locale)
  const source = xml ? <XmlSource xml={xml} label={t('xml')} /> : null
  if (result && !result.ok) {
    return <section className="viewer-status"><p role="alert">{t(result.error)}</p>{result.error !== 'tooLarge' && source}</section>
  }
  const data = invoice ?? result?.invoice
  if (!data) return <p className="viewer-status">{t('empty')}</p>
  const warnings = result?.warnings ?? []
  const { date, amount, decimal } = formatters(locale, data.currency)
  const type = t(data.kind)
  const coded = (family: string, code?: string) => code && t(family + '.' + code, code)
  const rate = (value?: string) => value === undefined ? undefined : decimal(value) + '%'
  const references: Entry[] = [
    [t('buyerRef'), data.buyerReference], [t('orderRef'), data.orderReference],
    [t('contractRef'), data.contractReference], [t('period'), periodLabel(data.period, date, t)],
  ]

  function adjustmentList(adjustments: Adjustment[]) {
    return <ul className="adjustments">{adjustments.map((adjustment, index) =>
      <li key={index}>
        <strong>{t(adjustment.charge === undefined ? 'adjustment' : adjustment.charge ? 'charge' : 'allowance')} {amount(adjustment.amount)}</strong>
        <Fields entries={[
          [t('baseAmount'), amount(adjustment.baseAmount)], [t('rate'), rate(adjustment.percentage)],
          [t('vatCategory'), [coded('vat', adjustment.vatCategory), rate(adjustment.vatRate)].filter(Boolean).join(' ')],
        ]} />
        {(adjustment.reason || adjustment.reasonCode) && <p>{[adjustment.reason, adjustment.reasonCode].filter(Boolean).join(' · ')}</p>}
      </li>)}</ul>
  }

  return <article className="invoice-sheet" aria-label={type}>
    <header className="invoice-heading">
      <div><span className={data.kind === 'creditNote' ? 'document-kind credit' : 'document-kind'}>{type}</span>
        <h2>{data.number ?? type}</h2></div>
      <Fields entries={[
        [t('issueDate'), date(data.issueDate)], [t('dueDate'), date(data.dueDate)],
        [t('typeCode'), data.typeCode], [t('currency'), data.currency],
      ]} />
    </header>
    {warnings.length > 0 && <details className="warnings no-print">
      <summary>{t('warnings')} ({warnings.length})</summary>
      <ul>{warnings.map(({ field, line }, index) => <li key={index}>
        {line && t('line') + ' ' + line + ' · '}{t('missing')} — {t(field)}
      </li>)}</ul>
    </details>}
    <div className="parties"><PartyBlock title={t('seller')} party={data.seller} t={t} /><PartyBlock title={t('buyer')} party={data.buyer} t={t} /></div>
    {references.some(([, value]) => value) && <section><h2>{t('references')}</h2><Fields entries={references} /></section>}
    {data.delivery && <section><h2>{t('delivery')}</h2>
      <Fields entries={[[t('deliveryDate'), date(data.delivery.date)]]} /><AddressBlock address={data.delivery.address} />
    </section>}
    <section>
      <div className="table-scroll line-items" role="region" aria-label={t('items')} tabIndex={0}>
        <table><caption>{t('items')}</caption>
          <thead><tr>{['lineId', 'item', 'quantity', 'unitPrice', 'vatCategory', 'netAmount'].map(key => <th key={key} scope="col">{t(key)}</th>)}</tr></thead>
          <tbody>{data.lines.map((line, index) => <tr key={index}>
            <td>{line.id}</td>
            <th scope="row"><strong>{line.name}</strong>
              {line.description && <p>{line.description}</p>}
              <Fields entries={[
                [t('sellerItemId'), line.sellerItemId], [t('period'), periodLabel(line.period, date, t)],
              ]} />
              {line.adjustments.length > 0 && adjustmentList(line.adjustments)}
            </th>
            <td className="numeric">{decimal(line.quantity)} {coded('unit', line.unit)}</td>
            <td className="numeric">{amount(line.unitPrice)}
              {line.baseQuantity && <small>{t('baseQuantity')} · {decimal(line.baseQuantity)} {coded('unit', line.baseUnit)}</small>}
            </td>
            <td>{coded('vat', line.vatCategory)} {rate(line.vatRate)}</td>
            <td className="numeric">{amount(line.netAmount)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    {data.adjustments.length > 0 && <section><h2>{t('adjustments')}</h2>{adjustmentList(data.adjustments)}</section>}
    <div className="financials">
      {data.taxes.length > 0 && <section>
        <div className="table-scroll" role="region" aria-label={t('vat')} tabIndex={0}>
          <table><caption>{t('vat')}</caption>
            <thead><tr>{['vatCategory', 'rate', 'taxable', 'taxAmount'].map(key => <th key={key} scope="col">{t(key)}</th>)}</tr></thead>
            <tbody>{data.taxes.map((tax, index) => <tr key={index}>
              <th scope="row">{coded('vat', tax.category)}
                {(tax.exemptionReason || tax.exemptionCode) && <small>{t('exemption')} · {[tax.exemptionReason, tax.exemptionCode].filter(Boolean).join(' · ')}</small>}
              </th>
              <td>{rate(tax.rate)}</td><td className="numeric">{amount(tax.taxableAmount, tax.currency)}</td>
              <td className="numeric">{amount(tax.taxAmount, tax.currency)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>}
      <section className="totals"><h2>{t('totals')}</h2>
        <Fields entries={[
          ...totalKeys.map((key): Entry => [t(key), amount(data.totals[key])]),
          ...(data.taxTotals ?? []).map((tax): Entry => [t('taxTotal'), amount(tax.amount, tax.currency)]),
        ]} />
        {data.totals.payable !== undefined && <div className="payable"><Fields entries={[[t('payable'), amount(data.totals.payable)]]} /></div>}
      </section>
    </div>
    {(data.payments.length > 0 || data.paymentTerms.length > 0) && <section className="payment">
      <h2>{t('payment')}</h2>
      {data.payments.map((payment, index) => <Fields key={index} entries={[
        [t('means'), coded('payment', payment.means)], [t('accountId'), groupIban(payment.accountId)],
        ['BIC', payment.bic], [t('accountName'), payment.accountName],
        [t('reference'), paymentReference(payment.reference)],
      ]} />)}
      {data.paymentTerms.length > 0 && <Fields entries={[[t('terms'), data.paymentTerms.map((term, index) => <p key={index}>{term}</p>)]]} />}
    </section>}
    {data.notes.length > 0 && <section><h2>{t('notes')}</h2>{data.notes.map((note, index) => <p className="note" key={index}>{note}</p>)}</section>}
    {data.attachments.length > 0 && <section><h2>{t('attachments')}</h2>
      <ul className="attachments">{data.attachments.map((attachment, index) =>
        <AttachmentRow key={index} attachment={attachment} t={t} />)}</ul>
    </section>}
    <div className="viewer-tools no-print">
      <button type="button" onClick={() => window.print()}>{t('print')}</button>
      {source}
    </div>
  </article>
}

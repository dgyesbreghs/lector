// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import invoiceXml from '../fixtures/edge/missing-optional.xml?raw'
import creditXml from '../fixtures/edge/credit-note.xml?raw'
import brokenXml from '../fixtures/edge/malformed.xml?raw'
import attachmentXml from '../fixtures/edge/embedded-pdf.xml?raw'
import { PeppolInvoiceViewer } from './PeppolInvoiceViewer'
import { parseUbl } from './parseUbl'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('PeppolInvoiceViewer', () => {
  it('renders a readable invoice, accessible tables, and XML source', async () => {
    render(<PeppolInvoiceViewer locale="en-GB" xml={invoiceXml} />)
    const article = screen.getByRole('article', { name: 'Invoice' })
    expect(within(article).getByRole('heading', { name: 'MIN-1' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Line items' })).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: 'Book' })).toBeTruthy()
    expect(screen.getByText('Amount payable').nextElementSibling?.textContent).toBe('€0.00')
    const summary = screen.getByText('Show XML')
    expect(summary.closest('details')?.open).toBe(false)
    fireEvent.click(summary)
    expect(summary.closest('details')?.open).toBe(true)
    await waitFor(() => expect(summary.nextElementSibling?.textContent).toBe(invoiceXml))
  })

  it('accepts a pre-parsed credit note without source XML', () => {
    const parsed = parseUbl(creditXml)
    if (!parsed.ok) throw new Error(parsed.error)
    render(<PeppolInvoiceViewer locale="en-GB" invoice={parsed.invoice} />)
    expect(screen.getByRole('article', { name: 'Credit note' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'CN-42' })).toBeTruthy()
    expect(screen.queryByText('Show XML')).toBeNull()
  })

  it('shows empty and parsing-error states', () => {
    const { rerender } = render(<PeppolInvoiceViewer locale="en-GB" xml="" />)
    expect(screen.getByText('Open an XML file to view an invoice or credit note.')).toBeTruthy()
    rerender(<PeppolInvoiceViewer locale="en-GB" xml={brokenXml} />)
    expect(screen.getByRole('alert').textContent).toBe('The file contains invalid XML.')
  })

  it('makes missing-field warnings collapsible', () => {
    render(<PeppolInvoiceViewer locale="en-GB" xml={creditXml} />)
    const summary = screen.getByText(/^Warnings/)
    expect(summary.closest('details')?.open).toBe(false)
    fireEvent.click(summary)
    expect(summary.closest('details')?.open).toBe(true)
    expect(screen.getByText('Missing required field — Seller name')).toBeTruthy()
  })

  it('downloads an attachment as a Blob and only links HTTP(S) URIs', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    })
    let filename: string | undefined
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      filename = this.download
    })
    render(<PeppolInvoiceViewer locale="en-GB" xml={attachmentXml} />)
    fireEvent.click(screen.getByRole('button', { name: 'Download support.pdf' }))
    expect(filename).toBe('support.pdf')
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/pdf' }))
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('javascript:alert(1)').tagName).toBe('SPAN')
    fireEvent.click(screen.getByRole('button', { name: 'Preview PDF' }))
    expect(screen.getByTitle('support.pdf').getAttribute('src')).toBe('blob:test')
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }))
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledTimes(2)
  })

  it('downloads SVG declarations as generic data without a preview', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:test')
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = create
      static revokeObjectURL = vi.fn()
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const xml = attachmentXml.replace('application/pdf', 'image/svg+xml').replace('support.pdf', 'support.svg')
    render(<PeppolInvoiceViewer locale="en-GB" xml={xml} />)
    expect(screen.queryByRole('button', { name: 'Preview PDF' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Download support.svg' }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'application/octet-stream' }))
    expect(click.mock.contexts[0]).toHaveProperty('download', 'support.svg.bin')
    vi.runAllTimers()
  })

  it('updates labels and number/date formats when locale changes', () => {
    const { rerender } = render(<PeppolInvoiceViewer locale="en-GB" xml={invoiceXml} />)
    expect(screen.getByText('20 Nov 2026')).toBeTruthy()
    rerender(<PeppolInvoiceViewer locale="fr-BE" xml={invoiceXml} />)
    expect(screen.getByRole('article', { name: 'Facture' })).toBeTruthy()
    expect(screen.getByText('Montant à payer').nextElementSibling?.textContent).toMatch(/0,00\s*€/)
    rerender(<PeppolInvoiceViewer locale="nl-BE" xml={invoiceXml} />)
    expect(screen.getByRole('article', { name: 'Factuur' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Factuurregels' })).toBeTruthy()
  })
})

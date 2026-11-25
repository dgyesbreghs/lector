import { useEffect, useState } from 'react'
import type { Attachment } from './model'
import type { translator } from './i18n'

const mimeTypes = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
])

function externalLink(uri?: string) {
  if (!uri) return undefined
  try {
    const parsed = new URL(uri)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href
  } catch { /* Relative and malformed URLs remain text. */ }
}

function embeddedBlob(embedded: NonNullable<Attachment['embedded']>) {
  const decoded = atob(embedded.base64)
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0))
  const declared = embedded.mime?.trim().toLowerCase() ?? ''
  const isPdf = declared === 'application/pdf' && decoded.startsWith('%PDF-')
  const mime = mimeTypes.has(declared) && (declared !== 'application/pdf' || isPdf)
    ? declared : 'application/octet-stream'
  return new Blob([bytes], { type: mime })
}

export function AttachmentRow({ attachment, t }: { attachment: Attachment; t: ReturnType<typeof translator> }) {
  const [opened, setOpened] = useState<{ url: string; attachment: Attachment }>()
  const [invalid, setInvalid] = useState<Attachment>()
  const { embedded, uri } = attachment
  if (opened && opened.attachment !== attachment) setOpened(undefined)
  if (invalid && invalid !== attachment) setInvalid(undefined)
  const preview = opened?.attachment === attachment ? opened.url : undefined
  const title = embedded?.filename ?? attachment.description ?? attachment.id ?? t('attachment')
  const href = externalLink(uri)

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview)
  }, [preview])

  function useAttachment(action: 'download' | 'preview') {
    if (!embedded) return
    try {
      const blob = embeddedBlob(embedded)
      if (action === 'preview') {
        if (blob.type !== 'application/pdf') throw new Error('Invalid PDF')
        setOpened({ url: URL.createObjectURL(blob), attachment })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        const filename = title.replace(/[\\/\u0000-\u001f\u007f]/g, '_')
        link.download = blob.type === 'application/octet-stream' ? filename + '.bin' : filename
        document.body.append(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setInvalid(undefined)
    } catch {
      setInvalid(attachment)
    }
  }

  return <li className="attachment">
    <strong>{title}</strong>
    {attachment.description && attachment.description !== title && <p>{attachment.description}</p>}
    <div className="actions">
      {embedded && <button type="button" aria-label={t('download') + ' ' + title} onClick={() => useAttachment('download')}>{t('download')}</button>}
      {embedded?.mime?.trim().toLowerCase() === 'application/pdf' &&
        <button type="button" aria-expanded={Boolean(preview)} onClick={() => preview ? setOpened(undefined) : useAttachment('preview')}>
          {t(preview ? 'closePreview' : 'preview')}
        </button>}
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">{t('external')}</a> : uri && <span>{uri}</span>}
    </div>
    {invalid === attachment && <p role="alert">{t('attachmentError')}</p>}
    {preview && <iframe className="pdf-preview" title={title} src={preview} referrerPolicy="no-referrer" />}
  </li>
}

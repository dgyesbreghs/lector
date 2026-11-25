import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import example from '../fixtures/official/base-example.xml?raw'
import { translator } from './i18n'
import type { ParseError } from './model'
import { MAX_XML_BYTES } from './parseUbl'
import { PeppolInvoiceViewer } from './PeppolInvoiceViewer'

const locales = [['en-BE', 'English'], ['nl-BE', 'Nederlands'], ['fr-BE', 'Français']]

function App() {
  const [locale, setLocale] = useState('en-BE')
  const [source, setSource] = useState({ xml: '', filename: '', revision: 0 })
  const [error, setError] = useState<ParseError | 'readError'>()
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const revision = useRef(0)
  const t = translator(locale)
  useEffect(() => { document.documentElement.lang = locale }, [locale])

  async function openFile(file?: File) {
    if (!file) return
    const current = ++revision.current
    setError(undefined)
    setSource({ xml: '', filename: file.name, revision: current })
    if (file.size > MAX_XML_BYTES) {
      setError('tooLarge')
      return
    }
    try {
      const xml = await file.text()
      if (current === revision.current) {
        if (xml.trim()) setSource({ xml, filename: file.name, revision: current })
        else setError('malformedXml')
      }
    } catch {
      if (current === revision.current) setError('readError')
    }
  }

  return <>
    <header className="app-header no-print">
      <div className="shell topbar">
        <strong><span className="brand-mark" aria-hidden="true">P</span> {t('title')}</strong>
        <label className="language">{t('language')}
          <select value={locale} onChange={event => setLocale(event.target.value)}>
            {locales.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
    </header>
    <main className="shell">
      <section className="workspace no-print">
        <h1>{t('intro')}</h1><p>{t('privacy')}</p>
        <div className={dragging ? 'dropzone dragging' : 'dropzone'}
          onDragOver={event => { event.preventDefault(); setDragging(true) }}
          onDragLeave={event => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false)
          }}
          onDrop={event => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files[0]) }}>
          <p>{t('drop')}</p>
          <div className="actions">
            <button className="primary" type="button" onClick={() => picker.current?.click()}>{t('choose')}</button>
            <button type="button" onClick={() => {
              setError(undefined)
              setSource({ xml: example, filename: 'base-example.xml', revision: ++revision.current })
            }}>{t('example')}</button>
          </div>
          <input ref={picker} type="file" accept=".xml,application/xml,text/xml" hidden onChange={event => {
            void openFile(event.currentTarget.files?.[0])
            event.currentTarget.value = ''
          }} />
        </div>
      </section>
      {source.filename && <div className="document-toolbar no-print">
        <strong>{source.filename}</strong>
      </div>}
      {error ? <p className="viewer-status" role="alert">{t(error)}</p> :
        <PeppolInvoiceViewer key={source.revision} xml={source.xml} locale={locale} />}
    </main>
  </>
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

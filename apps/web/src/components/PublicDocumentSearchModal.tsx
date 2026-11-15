import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DocumentExportError, downloadPublicDocumentExport, findPublicDocumentExport,
  type PublicDocumentExport,
} from '../api/documentExports'
import { Icon } from './Icon'
import { localeFor } from '../i18n'

export function PublicDocumentSearchModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [hash, setHash] = useState('')
  const [result, setResult] = useState<PublicDocumentExport | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function search(event: FormEvent) {
    event.preventDefault()
    const normalized = hash.trim().toUpperCase()
    if (!/^[A-Z0-9]{12}$/.test(normalized)) {
      setError(t('publicSearch.invalidHash'))
      setResult(null)
      return
    }
    setPending(true)
    setError('')
    try {
      setResult(await findPublicDocumentExport(normalized))
      setHash(normalized)
    } catch (searchError) {
      setResult(null)
      setError(searchError instanceof DocumentExportError && searchError.status === 404
        ? t('publicSearch.notFound') : t('publicSearch.failed'))
    } finally {
      setPending(false)
    }
  }

  return <div className="document-preview-backdrop"><section className="public-document-dialog" role="dialog" aria-modal="true" aria-label={t('publicSearch.title')}>
    <header><div><span>{t('header.verifyDocument')}</span><h2>{t('publicSearch.title')}</h2><p>{t('publicSearch.description')}</p></div>
      <button type="button" aria-label={t('common.close')} onClick={onClose}><Icon name="close" /></button></header>
    <form onSubmit={search}><label><span>{t('publicSearch.hash')}</span><input value={hash} maxLength={12} autoFocus
      onChange={(event) => setHash(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
      placeholder={t('publicSearch.example')} /></label><button type="submit" disabled={pending}>{pending ? t('common.searching') : t('common.search')}</button></form>
    {error && <p className="document-export-error">{error}</p>}
    {result && <article className="public-document-result"><div><span>{result.accessHash}</span><strong>{result.documentName}</strong>
      <small>{new Date(result.createdAt).toLocaleString(localeFor(i18n.resolvedLanguage))} · {(result.fileSize / 1024).toFixed(1)} KB</small></div>
      <button type="button" onClick={() => downloadPublicDocumentExport(result.accessHash, result.originalFileName)}>
        {t('document.downloadPdf')} <Icon name="download" size={14} />
      </button></article>}
  </section></div>
}

import { type FormEvent, useState } from 'react'
import {
  DocumentExportError, downloadPublicDocumentExport, findPublicDocumentExport,
  type PublicDocumentExport,
} from '../api/documentExports'
import { Icon } from './Icon'

export function PublicDocumentSearchModal({ onClose }: { onClose: () => void }) {
  const [hash, setHash] = useState('')
  const [result, setResult] = useState<PublicDocumentExport | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function search(event: FormEvent) {
    event.preventDefault()
    const normalized = hash.trim().toUpperCase()
    if (!/^[A-Z0-9]{12}$/.test(normalized)) {
      setError('12자리 해시번호를 입력해 주세요.')
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
        ? '해당 해시번호의 문서를 찾지 못했습니다.' : '문서를 검색하지 못했습니다.')
    } finally {
      setPending(false)
    }
  }

  return <div className="document-preview-backdrop"><section className="public-document-dialog" role="dialog" aria-modal="true" aria-label="해시번호로 문서 찾기">
    <header><div><span>PUBLIC DOCUMENT</span><h2>해시번호로 문서 찾기</h2><p>PDF 파일명 앞의 12자리 해시번호를 입력하세요.</p></div>
      <button type="button" aria-label="닫기" onClick={onClose}><Icon name="close" /></button></header>
    <form onSubmit={search}><label><span>문서 해시번호</span><input value={hash} maxLength={12} autoFocus
      onChange={(event) => setHash(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
      placeholder="예: A7K9M2Q4X8PL" /></label><button type="submit" disabled={pending}>{pending ? '검색 중…' : '검색'}</button></form>
    {error && <p className="document-export-error">{error}</p>}
    {result && <article className="public-document-result"><div><span>{result.accessHash}</span><strong>{result.documentName}</strong>
      <small>{new Date(result.createdAt).toLocaleString('ko-KR')} · {(result.fileSize / 1024).toFixed(1)} KB</small></div>
      <button type="button" onClick={() => downloadPublicDocumentExport(result.accessHash, result.originalFileName)}>
        PDF 다운로드 <Icon name="download" size={14} />
      </button></article>}
  </section></div>
}

import { useDeleteDocumentExportMutation, useDocumentExportsQuery } from '../api/documentExportQueries'
import { downloadDocumentExport } from '../api/documentExports'
import { Icon } from './Icon'

export function DocumentHistoryModal({ onClose }: { onClose: () => void }) {
  const query = useDocumentExportsQuery()
  const deletion = useDeleteDocumentExportMutation()
  return <div className="document-preview-backdrop"><section className="document-history-dialog" role="dialog" aria-modal="true" aria-label="PDF 다운로드 내역">
    <header><div><span>DOCUMENT ARCHIVE</span><h2>PDF 다운로드 내역</h2></div>
      <button type="button" aria-label="닫기" onClick={onClose}><Icon name="close" /></button></header>
    <div className="document-history-body">
      {query.isPending && <p>내역을 불러오는 중…</p>}
      {query.isError && <p className="document-export-error">다운로드 내역을 불러오지 못했습니다.</p>}
      {query.data?.length === 0 && <p>아직 생성한 PDF가 없습니다.</p>}
      {query.data?.map((history) => <article key={history.id}>
        <div><strong>{history.documentName}</strong><span>{new Date(history.createdAt).toLocaleString('ko-KR')}</span>
          <small>{history.creatorName} · {(history.fileSize / 1024).toFixed(1)} KB · {history.storageProvider}</small>
          <code title={history.filePath}>{history.filePath}</code></div>
        <div><button type="button" onClick={() => downloadDocumentExport(history.id, history.originalFileName)}>다운로드</button>
          <button className="is-danger" type="button" disabled={deletion.isPending} onClick={() => {
            if (window.confirm(`'${history.documentName}' 다운로드 내역과 파일을 삭제할까요?`)) deletion.mutate(history.id)
          }}>삭제</button></div>
      </article>)}
    </div>
  </section></div>
}

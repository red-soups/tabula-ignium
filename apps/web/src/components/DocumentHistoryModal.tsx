import { useDeleteDocumentExportMutation, useDocumentExportsQuery } from '../api/documentExportQueries'
import { useTranslation } from 'react-i18next'
import { downloadDocumentExport } from '../api/documentExports'
import { Icon } from './Icon'
import { localeFor } from '../i18n'

export function DocumentHistoryModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const query = useDocumentExportsQuery()
  const deletion = useDeleteDocumentExportMutation()
  return <div className="document-preview-backdrop"><section className="document-history-dialog" role="dialog" aria-modal="true" aria-label={t('history.title')}>
    <header><div><span>{t('history.shortTitle')}</span><h2>{t('history.title')}</h2></div>
      <button type="button" aria-label={t('common.close')} onClick={onClose}><Icon name="close" /></button></header>
    <div className="document-history-body">
      {query.isPending && <p>{t('history.loading')}</p>}
      {query.isError && <p className="document-export-error">{t('history.loadError')}</p>}
      {query.data?.length === 0 && <p>{t('history.empty')}</p>}
      {query.data?.map((history) => <article key={history.id}>
        <div><strong>{history.documentName}</strong><span>{new Date(history.createdAt).toLocaleString(localeFor(i18n.resolvedLanguage))}</span>
          <small>{history.creatorName} · {(history.fileSize / 1024).toFixed(1)} KB · {history.storageProvider}</small>
          <code title={history.filePath}>{history.filePath}</code></div>
        <div><button type="button" onClick={() => downloadDocumentExport(history.id, history.originalFileName)}>{t('common.download')}</button>
          <button className="is-danger" type="button" disabled={deletion.isPending} onClick={() => {
            if (window.confirm(t('history.confirmDelete', { name: history.documentName }))) deletion.mutate(history.id)
          }}>{t('common.delete')}</button></div>
      </article>)}
    </div>
  </section></div>
}

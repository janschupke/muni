'use client'

import { MAX_FILE_BYTES, type DatasetKind, type FileError, type ParsedFile } from '@muni/importer'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { Dropzone } from '@muni/ui/dropzone'
import { FileSpreadsheet, TriangleAlert, X } from 'lucide-react'

import { useImportText } from './use-issue-text'

export interface RejectedFile {
  fileName: string
  error: FileError | 'TOO_LARGE'
  missingColumns: string[]
}

export function UploadStep({
  files,
  rejected,
  onFiles,
  onRemove,
  onNext,
}: {
  files: Partial<Record<DatasetKind, ParsedFile>>
  rejected: RejectedFile[]
  onFiles: (files: File[]) => void
  onRemove: (kind: DatasetKind) => void
  onNext: () => void
}) {
  const { t, fieldLabel } = useImportText()
  const accepted = Object.values(files)
  return (
    <div className="flex flex-col gap-4">
      <Dropzone
        accept=".csv,.txt,text/csv"
        multiple
        onFiles={onFiles}
        title={t('upload.title')}
        hint={t('upload.hint')}
      />

      {rejected.map(file => (
        <p
          key={file.fileName}
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger-fg"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          {file.error === 'TOO_LARGE'
            ? t('upload.tooLarge', { name: file.fileName })
            : file.error === 'MISSING_COLUMNS'
              ? t('upload.errors.MISSING_COLUMNS', {
                  name: file.fileName,
                  columns: file.missingColumns.map(fieldLabel).join(', '),
                })
              : t(`upload.errors.${file.error}`, { name: file.fileName })}
        </p>
      ))}

      {accepted.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {accepted.map(file =>
            file.kind ? (
              <li
                key={file.kind}
                className="flex items-start gap-3 rounded-lg border border-border-default bg-surface-elevated p-3"
              >
                <FileSpreadsheet aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-text" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{file.fileName}</span>
                    <Badge tone="accent">{t(`kinds.${file.kind}`)}</Badge>
                  </div>
                  <p className="mt-0.5 text-fg-muted">
                    {t('upload.details', {
                      encoding: file.encoding.toUpperCase(),
                      delimiter: file.delimiter === '\t' ? 'TAB' : file.delimiter,
                      rows: file.rows.length,
                    })}
                  </p>
                  {file.skipped.blankLines + file.skipped.repeatedHeaders + file.skipped.comments >
                    0 && (
                    <p className="text-xs text-fg-subtle">
                      {t('upload.skipped', {
                        blank: file.skipped.blankLines,
                        headers: file.skipped.repeatedHeaders,
                        comments: file.skipped.comments,
                      })}
                    </p>
                  )}
                  {file.unknownColumns.length > 0 && (
                    <p className="text-xs text-warning-fg">
                      {t('upload.unknownColumns', { columns: file.unknownColumns.join(', ') })}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('upload.removeFile', { name: file.fileName })}
                  onClick={() => {
                    onRemove(file.kind as DatasetKind)
                  }}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ) : null
          )}
        </ul>
      )}

      <p className="text-xs text-fg-subtle">
        {t('upload.replaced', { mb: Math.round(MAX_FILE_BYTES / 1024 / 1024) })}
      </p>

      <div>
        <Button variant="primary" disabled={accepted.length === 0} onClick={onNext}>
          {t('upload.next')}
        </Button>
      </div>
    </div>
  )
}

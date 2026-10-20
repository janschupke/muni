'use client'

import type { ReferenceSnapshot } from '@muni/importer'
import { StepIndicator } from '@muni/ui/step-indicator'
import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'

import { useFocusOnChange } from '@/lib/use-focus-on-change'

import { ConfirmStep } from './confirm-step'
import { ProgressStep } from './progress-step'
import { UploadStep } from './upload-step'
import { useChunkedImport } from './use-chunked-import'
import { useImportFiles } from './use-import-files'
import { useImportText } from './use-issue-text'

// Loaded when needed: the review's table, once files are read.
const ReviewStep = dynamic(() => import('./review-step').then(m => m.ReviewStep))

/**
 * The import: upload → review → confirm → progress. Parsing and validation run in the
 * browser with the same @muni/importer the seed uses (`useImportFiles`); the server
 * re-validates each chunk it writes (`useChunkedImport`).
 */
export function ImportWizard({
  reference,
  today,
}: {
  reference: ReferenceSnapshot
  today: string
}) {
  const { t } = useImportText()
  const imported = useImportFiles(reference, today)
  const writing = useChunkedImport()
  const [step, setStep] = useState(0)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  // Each step is named, and a new step takes the focus: the button that led to it is gone.
  useFocusOnChange(stepHeading, step)

  const steps = [t('steps.upload'), t('steps.review'), t('steps.confirm'), t('steps.done')]
  return (
    <div className="flex flex-col gap-6">
      <StepIndicator steps={steps} current={step} />
      <h2 ref={stepHeading} tabIndex={-1} className="sr-only">
        {t('stepHeading', { step: step + 1, count: steps.length, name: steps[step] ?? '' })}
      </h2>
      {step === 0 && (
        <UploadStep
          files={imported.files}
          rejected={imported.rejected}
          onFiles={incoming => {
            void imported.add(incoming)
          }}
          onRemove={imported.remove}
          onNext={() => {
            setStep(1)
          }}
        />
      )}
      {step === 1 && (
        <ReviewStep
          batch={imported.batch}
          columnsByKind={imported.columnsByKind}
          onEdit={imported.editCell}
          onRemoved={imported.setRemoved}
          onRevert={imported.revert}
          onBack={() => {
            setStep(0)
          }}
          onNext={() => {
            setStep(2)
          }}
        />
      )}
      {step === 2 && (
        <ConfirmStep
          batch={imported.batch}
          onBack={() => {
            setStep(1)
          }}
          onStart={() => {
            setStep(3)
            void writing.run(imported.batch)
          }}
        />
      )}
      {step === 3 && writing.job && (
        <ProgressStep
          job={writing.job}
          onReset={() => {
            imported.reset()
            writing.clear()
            setStep(0)
          }}
        />
      )}
    </div>
  )
}

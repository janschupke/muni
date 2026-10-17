'use client'

import { todayIn } from '@muni/utils/dates'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { EmployeeForm } from '@/components/form/entity-forms'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { FORM_READ, readQuery } from '@/lib/query/queries'
import { saveEmployee } from '@/server/actions/edit'

/** A new person (no `externalId`), or one to edit; the form opens once its choices are read. */
export function EmployeeFormView({ externalId }: { externalId?: string | undefined }) {
  const t = useTranslations()
  const read = useQuery({
    ...readQuery('employee-form', { externalId }),
    ...FORM_READ,
  })
  return (
    <ReadView query={read} skeleton={<FormSkeleton fields={10} />} entity="employees">
      {({ employee, departments, positions, pairs, heads, managers }) => {
        const choices = {
          departments,
          positions,
          positionsByDepartment: pairs,
          heads,
          managers,
        }
        if (!employee)
          return (
            <EmployeeForm
              isNew
              action={saveEmployee.bind(null, null)}
              cancelHref="/employees"
              heading={{
                title: t('forms.employee.newTitle'),
                eyebrow: (
                  <BackLink fallback={{ href: '/employees', label: t('employees.title') }} />
                ),
                description: t('forms.employee.newHelp'),
              }}
              defaults={{
                firstName: '',
                lastName: '',
                email: null,
                nationalId: null,
                departmentId: null,
                positionId: null,
                managerId: null,
                leadsDepartment: false,
                hiredOn: todayIn(),
                leftOn: null,
                status: 'ACTIVE',
                note: null,
              }}
              {...choices}
            />
          )
        const name = `${employee.firstName} ${employee.lastName}`
        const href = `/employees/${employee.externalId}`
        return (
          <EmployeeForm
            action={saveEmployee.bind(null, employee.externalId)}
            cancelHref={href}
            heading={{
              title: t('forms.employee.title', { name }),
              eyebrow: <BackLink fallback={{ href, label: name }} />,
            }}
            defaults={employee}
            {...choices}
          />
        )
      }}
    </ReadView>
  )
}

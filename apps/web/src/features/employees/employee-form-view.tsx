'use client'

import { displayName } from '@muni/domain/names'
import { todayIn } from '@muni/utils/dates'
import { useTranslations } from 'next-intl'

import { EmployeeForm } from '@/components/form/employee-form'
import { formShell, useFormRead } from '@/components/form/form-view'
import { ReadView } from '@/components/read-view'
import { FormSkeleton } from '@/components/skeletons'
import { saveEmployee } from '@/server/actions/edit'

/** A new person (no `externalId`), or one to edit; the form opens once its choices are read. */
export function EmployeeFormView({ externalId }: { externalId?: string | undefined }) {
  const t = useTranslations()
  const read = useFormRead('employee-form', { externalId })
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
              {...formShell({
                action: saveEmployee.bind(null, null),
                back: { href: '/employees', label: t('employees.title') },
                title: t('forms.employee.newTitle'),
                description: t('forms.employee.newHelp'),
                isNew: true,
              })}
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
        const name = displayName(employee)
        const href = `/employees/${employee.externalId}`
        return (
          <EmployeeForm
            {...formShell({
              action: saveEmployee.bind(null, employee.externalId),
              back: { href, label: name },
              title: t('forms.employee.title', { name }),
            })}
            defaults={employee}
            {...choices}
          />
        )
      }}
    </ReadView>
  )
}

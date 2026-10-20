// Reading and focusing a form's fields, by their `data-field` marks.

/** A form's values by field name (several values of one name joined), to compare. */
export type Snapshot = ReadonlyMap<string, string>

export function snapshot(form: HTMLFormElement): Snapshot {
  const values = new Map<string, string[]>()
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== 'string') continue
    values.set(name, [...(values.get(name) ?? []), value])
  }
  // A checkbox group posts nothing when none is ticked: name it anyway, so unticking the
  // last box counts as a change.
  for (const field of form.querySelectorAll<HTMLElement>('[data-field]')) {
    const name = field.dataset['field']
    if (name && !values.has(name)) values.set(name, [])
  }
  return new Map([...values].map(([name, list]) => [name, list.join('\u001f')]))
}

/** The names whose value differs between two snapshots. */
export const differing = (a: Snapshot, b: Snapshot) =>
  [...new Set([...a.keys(), ...b.keys()])].filter(name => a.get(name) !== b.get(name))

const FOCUSABLE = 'input:not([type=hidden]):not([aria-hidden]), textarea, button, [tabindex]'

/** Focuses the control of the first field (in page order) that `pick` accepts. */
export function focusField(form: HTMLFormElement, pick: (name: string) => boolean) {
  for (const field of form.querySelectorAll<HTMLElement>('[data-field]')) {
    const name = field.dataset['field']
    if (!name || !pick(name)) continue
    const control = [...field.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      c => !(c as HTMLInputElement).disabled
    )
    if (control) {
      control.focus()
      return
    }
  }
}

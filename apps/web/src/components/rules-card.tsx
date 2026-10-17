import { Card, CardBody, CardHeader } from '@muni/ui/card'

/**
 * How a page's automatic choices are made, step by step, in words: the advisor's and the
 * planner's. Each says exactly what its code does.
 */
export function RulesCard({ title, rules }: { title: string; rules: readonly string[] }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
          {rules.map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </CardBody>
    </Card>
  )
}

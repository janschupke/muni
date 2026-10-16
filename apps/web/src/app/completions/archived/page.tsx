import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('completion')

export default function ArchivedCompletionsPage() {
  return <ArchivedListPage kind="completion" />
}

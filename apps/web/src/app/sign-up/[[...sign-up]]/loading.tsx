import { AuthFormSkeleton, PageLoading } from '@/components/views/skeletons'

export default function Loading() {
  return (
    <PageLoading>
      <AuthFormSkeleton />
    </PageLoading>
  )
}

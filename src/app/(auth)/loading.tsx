import { Skeleton } from '@/components/ui/skeleton'

export default function AuthLoading() {
  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex gap-6">
        {/* Sidebar skeleton */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 space-y-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <div className="space-y-1 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>

          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-[#E2E8F0] p-5 space-y-3"
            >
              <div className="flex justify-between">
                <Skeleton className="h-4 w-80" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-4 w-60" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-10 w-full" />
              <div className="flex justify-end gap-2 pt-2">
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

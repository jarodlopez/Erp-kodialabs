import { Card, Skeleton, TableSkeleton } from '@/components/ui/primitives';

/** Estado de carga compartido por las pantallas del área protegida. */
export default function Loading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <Skeleton className="h-5 w-40" />
        </div>
        <TableSkeleton rows={8} columns={6} />
      </Card>
    </>
  );
}

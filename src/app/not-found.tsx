import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

import { Button, Card } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="max-w-md p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-canvas)] text-[var(--color-ink-subtle)]">
          <FileQuestion className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">No encontramos esta página</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-subtle)]">
          El registro puede haber sido eliminado, o la dirección no es correcta.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/">
            <Button>Volver al dashboard</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

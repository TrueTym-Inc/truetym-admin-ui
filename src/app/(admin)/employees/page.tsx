import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';

import EmployeesClient from '@/app/(admin)/employees/EmployeesClient';

export default function EmployeesPage() {
  return (
    <Suspense fallback={<EmployeesLoading />}>
      <EmployeesClient />
    </Suspense>
  );
}

function EmployeesLoading() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex flex-col items-center gap-2 text-black">
        <RefreshCw className="h-5 w-5 animate-spin text-teal-600" />
        <span className="text-sm">Loading employees…</span>
      </div>
    </div>
  );
}

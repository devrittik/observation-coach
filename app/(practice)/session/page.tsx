import { Suspense } from 'react';
import { SessionSetup } from '@/components/Session';
import { Loading } from '@/components/ui';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SessionSetup />
    </Suspense>
  );
}

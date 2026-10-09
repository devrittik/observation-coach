import { Suspense } from 'react';
import { SessionFlow } from '@/components/Session';
import { Loading } from '@/components/ui';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <SessionFlow />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { Auth } from '@/components/Auth';
import { Loading } from '@/components/ui';
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Auth register />
    </Suspense>
  );
}

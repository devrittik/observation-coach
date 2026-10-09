import type { Metadata } from 'next';
import './globals.css';
import { CoachProvider } from '@/components/Provider';
import { Shell } from '@/components/Shell';
import { currentUser } from '@/lib/auth';
import { getProgress, getSessions } from '@/lib/db';
import { emptyProgress } from '@/lib/observation/progression';
import { providerConfig } from '@/lib/llm/provider';
export const metadata: Metadata = {
  title: 'Observation Coach — A little less screen. A little more world.',
  description:
    'A quiet practice in paying attention. Step outside, notice something small, and learn to see the everyday differently.',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const initial = {
    user,
    progress: user ? await getProgress(user.id) : emptyProgress(),
    sessions: user ? await getSessions(user.id) : [],
    ...providerConfig(),
  };
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a href="#main-content" className="sr-only focus:not-sr-only">
          Skip to content
        </a>
        <CoachProvider initial={initial}>
          <Shell>{children}</Shell>
        </CoachProvider>
      </body>
    </html>
  );
}

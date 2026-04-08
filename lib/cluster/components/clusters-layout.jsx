'use client';

import { PageLayout } from '../../chat/components/page-layout.js';

export function ClustersLayout({ session, children }) {
  return (
    <PageLayout session={session}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Clusters</h1>
      </div>
      {children}
    </PageLayout>
  );
}

import type { ReactNode } from "react";

import { PageBody } from "@/components/shell/page-body";
import { LoadingRegion } from "@/components/ui/loading";
import { PageHeaderSkeleton } from "@/components/ui/skeletons";

interface PageLoadingProps {
  /** Header shape — mirrors what the real page renders above its content. */
  description?: boolean;
  actions?: number;
  children: ReactNode;
}

/**
 * The frame every route-level `loading.tsx` shares: page body, a header
 * skeleton, and the announced busy region. Route fallbacks stay synchronous —
 * an async fallback suspends on its own and defeats the point.
 */
export function PageLoading({
  description = false,
  actions = 0,
  children,
}: PageLoadingProps) {
  return (
    <PageBody>
      <LoadingRegion className="flex flex-col gap-6">
        <PageHeaderSkeleton description={description} actions={actions} />
        {children}
      </LoadingRegion>
    </PageBody>
  );
}

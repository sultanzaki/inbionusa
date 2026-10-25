"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { RotateCw } from "lucide-react";
import { EmptyState } from "@/components/workspace/page-ui";
import { Button } from "@/components/ui/button";
export default function DashboardError({ retry }: { retry: () => void }) {
  const { t: localize } = useLocale();

  return (
    <div className="data-card">
      <EmptyState
        error
        title={localize("Could not load the workspace")}
        description="Could not open this page. Retry to continue."
      >
        <Button onClick={retry}>
          <RotateCw className="size-4" />
          <Localized>{" Retry "}</Localized>
        </Button>
      </EmptyState>
    </div>
  );
}

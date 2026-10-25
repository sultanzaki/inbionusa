import { Localized } from "@/components/i18n/locale-provider";
import { Suspense } from "react";
import { GrowthWorkspace } from "@/components/erp/growth-workspace";
export default function Page() {
  return (
    <Suspense
      fallback={
        <p>
          <Localized>{"Preparing workspace…"}</Localized>
        </p>
      }
    >
      <GrowthWorkspace area="documents" />
    </Suspense>
  );
}

import { Localized } from "@/components/i18n/locale-provider";
import { ERPWorkspace } from "@/components/erp/workspace";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense
      fallback={
        <p>
          <Localized>{"Preparing workspace…"}</Localized>
        </p>
      }
    >
      <ERPWorkspace area="production" />
    </Suspense>
  );
}

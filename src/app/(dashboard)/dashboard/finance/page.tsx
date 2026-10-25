import { Localized } from "@/components/i18n/locale-provider";
import { Suspense } from "react";
import { OperationalWorkspace } from "@/components/erp/workflows/workspace";
export default function Page() {
  return (
    <Suspense
      fallback={
        <p>
          <Localized>{"Preparing workspace…"}</Localized>
        </p>
      }
    >
      <OperationalWorkspace area="finance" />
    </Suspense>
  );
}

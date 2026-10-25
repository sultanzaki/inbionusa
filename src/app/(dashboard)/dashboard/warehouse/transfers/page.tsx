import { Localized } from "@/components/i18n/locale-provider";
import type { Metadata } from "next";
import { Suspense } from "react";
import { OperationsWorkspace } from "@/components/operations/workspace";
export const metadata: Metadata = {
  title: { absolute: "Warehouse transfers | INBIONUSA" },
};
export default function Page() {
  return (
    <Suspense
      fallback={
        <p role="status">
          <Localized>{"Preparing workspace…"}</Localized>
        </p>
      }
    >
      <OperationsWorkspace entity="warehouse_transfers" />
    </Suspense>
  );
}

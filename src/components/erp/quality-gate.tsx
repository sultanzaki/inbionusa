import { Localized } from "@/components/i18n/locale-provider";
import { ERPModuleGuard } from "./shared";
import Link from "next/link";
import { moduleGate } from "@/lib/erp/server";
import type { ReactNode } from "react";
export async function QualityGate({ children }: { children: ReactNode }) {
  const denied = await moduleGate("quality");
  return denied ? (
    <div className="erp-empty">
      <h1>
        <Localized>{"Quality module unavailable"}</Localized>
      </h1>
      <p>
        <Localized>
          {"This module is disabled or your account does not have access."}
        </Localized>
      </p>
      <Link href="/dashboard">
        <Localized>{"Return to overview"}</Localized>
      </Link>
    </div>
  ) : (
    <ERPModuleGuard module="quality">{children}</ERPModuleGuard>
  );
}

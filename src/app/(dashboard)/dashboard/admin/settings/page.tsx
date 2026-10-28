import { Localized } from "@/components/i18n/locale-provider";
import { ERPWorkspace } from "@/components/erp/workspace";
import { Suspense } from "react";
import { redirect } from "next/navigation";
async function Content({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  if (params.view === "locations") redirect("/dashboard/admin/places");
  return <ERPWorkspace area="settings" />;
}
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <p>
          <Localized>{"Preparing workspace…"}</Localized>
        </p>
      }
    >
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

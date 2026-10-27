import { Suspense } from "react";
import { PublicFormPage } from "@/components/forms/public-form";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Forms | INBIONUSA",
  robots: { index: false, follow: false },
};
async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicFormPage token={token} />;
}
export default function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          Memuat form…
        </p>
      }
    >
      <Content params={params} />
    </Suspense>
  );
}

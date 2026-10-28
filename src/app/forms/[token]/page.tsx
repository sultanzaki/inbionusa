import { Suspense } from "react";
import { PublicFormPage } from "@/components/forms/public-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { FormLoading } from "@/components/forms/form-loading";
import type { PublicForm } from "@/lib/forms/public";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Forms | INBIONUSA",
  robots: { index: false, follow: false },
};
async function Content({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success)
    return (
      <PublicFormPage
        token={token}
        initialForm={null}
        initialError="Form unavailable."
      />
    );
  const { data, error } = await createAdminClient().rpc("erp_form_public", {
    p_link: token,
  });
  return (
    <PublicFormPage
      token={token}
      initialForm={error ? null : (data as PublicForm)}
      initialError={
        error ? "This form is unavailable or responses have been paused." : ""
      }
    />
  );
}
export default function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <Suspense fallback={<FormLoading />}>
      <Content params={params} />
    </Suspense>
  );
}

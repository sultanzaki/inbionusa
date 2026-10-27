import { requireUser } from "@/lib/auth";
import { erpRpc, erpError } from "@/lib/erp/server";
import { privateJson } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  if (!(await requireUser()))
    return privateJson({ message: "Session expired." }, 401);
  const { id, file } = await params;
  if (!z.uuid().safeParse(id).success || !/^\d$/.test(file))
    return privateJson({ message: "File not found." }, 404);
  const result = await erpRpc("erp_form_file", {
    p_submission: id,
    p_index: Number(file),
  });
  if (result.error) return erpError(result.error);
  const link = await createAdminClient()
    .storage.from("form-attachments")
    .createSignedUrl(result.data.path, 60, { download: result.data.name });
  return link.error
    ? privateJson({ message: "File unavailable." }, 404)
    : Response.redirect(link.data.signedUrl);
}

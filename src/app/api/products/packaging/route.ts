import { requireUser } from "@/lib/auth";
import { privateJson } from "@/lib/api-response";
import { erpRpc, erpUxError } from "@/lib/erp/server";

export async function GET() {
  if (!(await requireUser()))
    return privateJson({ message: "Session expired." }, 401);
  const { data, error } = await erpRpc("erp_packaging_options");
  return error ? erpUxError(error) : privateJson({ options: data });
}

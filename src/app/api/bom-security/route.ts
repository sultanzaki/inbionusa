import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { erpRpc, erpUxError } from "@/lib/erp/server";
import { privateJson } from "@/lib/api-response";
import { sameOrigin } from "@/lib/erp/origin";
import { bomPasswordError } from "@/lib/bom-security";
const schema = z.object({
  action: z.enum([
    "status",
    "setup",
    "unlock",
    "lock",
    "grant",
    "revoke",
    "rotate",
    "recover",
  ]),
  formula_id: z.uuid(),
  password: z.string().max(256).optional(),
  user_id: z.uuid().optional(),
  reason: z.string().max(500).optional(),
});
export async function POST(request: Request) {
  if (!(await requireUser()))
    return privateJson({ message: "Session expired." }, 401);
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(":", "");
  if (
    !sameOrigin(
      request.headers.get("origin"),
      request.headers.get("host"),
      protocol,
    )
  )
    return privateJson({ message: "Invalid origin." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return privateJson({ message: "Use JSON." }, 415);
  let raw;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 4096)
      return privateJson({ message: "Request too large." }, 413);
    raw = JSON.parse(body);
  } catch {
    return privateJson({ message: "Invalid JSON." }, 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return privateJson({ message: "Review the selected BOM action." }, 422);
  const v = parsed.data;
  if (["setup", "rotate"].includes(v.action)) {
    const message = bomPasswordError(v.password);
    if (message) return privateJson({ message }, 422);
  }
  const { data, error } = await erpRpc("erp_bom_security", {
    p_action: v.action,
    p_formula: v.formula_id,
    p_password: v.password ?? null,
    p_user: v.user_id ?? null,
    p_reason: v.reason ?? "",
  });
  if (error?.code === "42501")
    return privateJson(
      { message: "You do not have permission to access this BOM." },
      403,
    );
  if (error) return erpUxError(error);
  if (data?.error)
    return privateJson(
      { message: data.error },
      data.status === 429 ? 429 : 422,
    );
  return privateJson(data);
}

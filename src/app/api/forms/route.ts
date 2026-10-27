import { requireUser } from "@/lib/auth";
import { erpRpc, erpError } from "@/lib/erp/server";
import { privateJson } from "@/lib/api-response";
import { sameOrigin } from "@/lib/erp/origin";
import { templateSchema } from "@/lib/forms/schema";
import { assertCleaningBindings } from "@/lib/forms/cleaning-template";
import { z } from "zod";
export async function GET(request: Request) {
  if (!(await requireUser()))
    return privateJson({ message: "Session expired." }, 401);
  const id = new URL(request.url).searchParams.get("id");
  if (id && !z.uuid().safeParse(id).success)
    return privateJson({ message: "Invalid form." }, 400);
  const { data, error } = await erpRpc("erp_forms_admin", {
    p_action: id ? "detail" : "list",
    p_id: id,
  });
  return error ? erpError(error) : privateJson(data);
}
export async function POST(request: Request) {
  if (!(await requireUser()))
    return privateJson({ message: "Session expired." }, 401);
  if (
    !sameOrigin(
      request.headers.get("origin"),
      request.headers.get("host"),
      new URL(request.url).protocol.replace(":", ""),
    )
  )
    return privateJson({ message: "Invalid origin." }, 403);
  try {
    const text = await request.text();
    if (text.length > 64000)
      return privateJson({ message: "Form too large." }, 413);
    const v = z
      .object({
        action: z.enum(["create", "save", "publish", "pause", "rotate"]),
        id: z.uuid().optional(),
        version: z.number().int().optional(),
        template: templateSchema.optional(),
      })
      .parse(JSON.parse(text));
    if (["create", "save"].includes(v.action) && !v.template)
      throw Error("Provide the form fields.");
    if (v.template) assertCleaningBindings(v.template);
    if (v.action === "publish") {
      const r = await erpRpc("erp_forms_admin", {
        p_action: "detail",
        p_id: v.id,
      });
      if (r.error) return erpError(r.error);
      const t = templateSchema.parse(r.data.draft);
      assertCleaningBindings(t);
    }
    const { data, error } = await erpRpc("erp_forms_admin", {
      p_action: v.action,
      p_id: v.id ?? null,
      p_version: v.version ?? null,
      p_template: v.template ?? null,
    });
    return error ? erpError(error) : privateJson(data);
  } catch (e) {
    return privateJson(
      { message: e instanceof Error ? e.message : "Review form fields." },
      422,
    );
  }
}

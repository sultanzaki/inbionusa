import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { erpRpc, erpError } from "@/lib/erp/server";
import { sameOrigin } from "@/lib/erp/origin";
import { privateJson } from "@/lib/api-response";
const name = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((v) => !v.includes("/"), "Use a name without /.");
const save = z.object({
  action: z.enum(["save_warehouse", "save_warehouse_location"]),
  request_key: z.uuid(),
  id: z.uuid().optional(),
  version: z.number().int().positive().optional(),
  name: name.optional(),
  room_name: name.optional(),
  warehouse_id: z.uuid().optional(),
  room_kind: z
    .enum(["warehouse", "laboratory", "production", "office", "other"])
    .optional(),
  address: z.string().max(4000).optional(),
  active: z.boolean(),
});
export async function GET(request: Request) {
  if (!(await requireUser()))
    return privateJson({ message: "Session expired." }, 401);
  const p = new URL(request.url).searchParams;
  const query = z
    .object({
      page: z.coerce.number().int().min(1).max(100000),
      q: z.string().max(100),
      site_id: z.union([z.uuid(), z.literal("")]),
    })
    .safeParse({
      page: p.get("page") || 1,
      q: p.get("q") || "",
      site_id: p.get("site") || "",
    });
  if (!query.success)
    return privateJson({ message: "Review the search and page number." }, 400);
  const { data, error } = await erpRpc("erp_places_admin", {
    p_action: "list",
    p: query.data,
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
    if (text.length > 12000)
      return privateJson({ message: "The request is too large." }, 413);
    const value = save.parse(JSON.parse(text));
    if (
      (value.action === "save_warehouse" && !value.name) ||
      (value.action === "save_warehouse_location" &&
        (!value.room_name || !value.warehouse_id || !value.room_kind))
    )
      return privateJson(
        { message: "Enter the name, site and room type." },
        422,
      );
    if (value.id && !value.version)
      return privateJson({ message: "Reload the record before saving." }, 422);
    const { action, ...payload } = value;
    const { data, error } = await erpRpc("erp_places_admin", {
      p_action: action,
      p: payload,
    });
    if (error?.code === "23505")
      return privateJson(
        {
          message:
            action === "save_warehouse"
              ? "This site name already exists."
              : "This room name already exists at this site.",
        },
        409,
      );
    return error ? erpError(error) : privateJson(data);
  } catch {
    return privateJson(
      {
        message: "Enter a site or room name of up to 100 characters without /.",
      },
      422,
    );
  }
}

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { privateJson } from "@/lib/api-response";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(request.url);
  const input = z
    .object({
      field: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
      q: z.string().max(150),
      offset: z.coerce.number().int().min(0).max(100000),
    })
    .safeParse({
      field: url.searchParams.get("field"),
      q: url.searchParams.get("q") || "",
      offset: url.searchParams.get("offset") || 0,
    });
  if (!z.uuid().safeParse(token).success || !input.success)
    return privateJson({ message: "Referensi tidak tersedia." }, 400);
  const { data, error } = await createAdminClient().rpc("erp_form_references", {
    p_link: token,
    p_field: input.data.field,
    p_search: input.data.q,
    p_offset: input.data.offset,
  });
  return error
    ? privateJson(
        { message: "Data referensi tidak tersedia. Hubungi pengelola form." },
        error.code === "42501" ? 403 : 404,
      )
    : privateJson(data);
}

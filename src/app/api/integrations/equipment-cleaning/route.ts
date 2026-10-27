import { createHash } from "node:crypto";
import { privateJson } from "@/lib/api-response";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formSchema,
  validSignature,
  inspectionPassed,
} from "@/lib/integrations/equipment-form";
export async function POST(request: Request) {
  const secret = process.env.EQUIPMENT_FORM_SECRET,
    source = process.env.EQUIPMENT_FORM_SOURCE_ID,
    actor = process.env.EQUIPMENT_FORM_ACTOR_ID,
    answers = process.env.EQUIPMENT_FORM_APPROVED_ANSWERS;
  if (!secret || secret.length < 32 || !source || !actor)
    return privateJson(
      { message: "Equipment integration is not configured." },
      503,
    );
  const bytes: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (!reader) return privateJson({ message: "Empty request." }, 400);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 65536) {
      await reader.cancel();
      return privateJson({ message: "Request too large." }, 413);
    }
    bytes.push(value);
  }
  const body = Buffer.concat(bytes).toString("utf8");
  if (
    !validSignature(
      body,
      request.headers.get("x-inb-timestamp") || "",
      request.headers.get("x-inb-signature") || "",
      secret,
    )
  )
    return privateJson({ message: "Invalid integration signature." }, 401);
  let payload, pass;
  try {
    payload = formSchema.parse(JSON.parse(body));
    pass = inspectionPassed(payload.fields, answers);
  } catch {
    return privateJson(
      { message: "Review form fields and integration answer configuration." },
      422,
    );
  }
  if (payload.source_id !== source)
    return privateJson({ message: "Source is not allowed." }, 403);
  const { data, error } = await createAdminClient().rpc(
    "erp_import_equipment_cleaning",
    {
      p_actor: actor,
      p_payload: payload,
      p_pass: pass,
      p_hash: createHash("sha256").update(body).digest("hex"),
    },
  );
  if (error)
    return privateJson(
      {
        message:
          error.code === "P0001"
            ? error.message
            : "Could not import cleaning. Check equipment, staff and access.",
      },
      error.code === "23505" ? 409 : 422,
    );
  return privateJson(data);
}

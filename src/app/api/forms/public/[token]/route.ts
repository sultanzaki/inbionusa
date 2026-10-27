import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { privateJson } from "@/lib/api-response";
import {
  templateSchema,
  uploadType,
  validateAnswers,
} from "@/lib/forms/schema";
import {
  resolvedTemplate,
  cleaningPayload,
  type PublicForm,
} from "@/lib/forms/public";
import { inspectionPassed } from "@/lib/integrations/equipment-form";
export const maxDuration = 60;
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success)
    return privateJson({ message: "Form unavailable." }, 404);
  const { data, error } = await createAdminClient().rpc("erp_form_public", {
    p_link: token,
  });
  return error
    ? privateJson({ message: "Form unavailable or paused." }, 404)
    : privateJson(data);
}
export async function POST(request: Request, { params }: Context) {
  const { token } = await params;
  if (!z.uuid().safeParse(token).success)
    return privateJson({ message: "Form unavailable." }, 404);
  const client = createAdminClient(),
    paths: string[] = [];
  let committed = false;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error("Empty submission.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3500000) {
        await reader.cancel();
        return privateJson({ message: "Maximum total upload is 3 MB." }, 413);
      }
      chunks.push(value);
    }
    const multipart = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const input = z
      .object({
        request_key: z.uuid(),
        revision: z.number().int(),
        answers: z.record(z.string(), z.string().max(4000)),
      })
      .parse(JSON.parse(String(multipart.get("data") || "")));
    const read = await client.rpc("erp_form_public", { p_link: token });
    if (read.error)
      return privateJson({ message: "Form unavailable or paused." }, 404);
    const form = read.data as PublicForm;
    form.template = templateSchema.parse(form.template);
    const entries: {
      field: string;
      file: File;
      bytes: Uint8Array;
      mime: string;
      ext: string;
      hash: string;
    }[] = [];
    for (const [key, value] of multipart.entries()) {
      if (key === "data") continue;
      if (typeof value === "string") throw Error("Unexpected file field.");
      if (value.size > 2000000 || !value.size)
        throw Error("Each file must be between 1 byte and 2 MB.");
      const bytes = new Uint8Array(await value.arrayBuffer()),
        type = uploadType(bytes);
      if (!type) throw Error("Upload PDF, JPG or PNG files.");
      if (entries.some((e) => e.field === key))
        throw Error("Choose one file for each upload field.");
      entries.push({
        field: key,
        file: value,
        bytes,
        ...type,
        hash: createHash("sha256").update(bytes).digest("hex"),
      });
    }
    if (entries.length > 3) throw Error("Maximum three files per submission.");
    if (entries.reduce((total, e) => total + e.file.size, 0) > 3000000)
      throw Error("Maximum total upload is 3 MB.");
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          revision: input.revision,
          answers: Object.fromEntries(
            Object.entries(input.answers).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          ),
          files: entries
            .map((e) => ({ field: e.field, name: e.file.name, hash: e.hash }))
            .sort((a, b) => a.field.localeCompare(b.field)),
        }),
      )
      .digest("hex");
    const replay = await client.rpc("erp_form_public_receipt", {
      p_link: token,
      p_request: input.request_key,
      p_hash: hash,
    });
    if (replay.error) throw Error(replay.error.message);
    if (replay.data) return privateJson(replay.data);
    if (
      entries.some(
        (e) =>
          !form.template.fields.some(
            (f) => f.id === e.field && f.type === "file",
          ),
      )
    )
      throw Error("Unknown file field.");
    const checked = validateAnswers(
      resolvedTemplate(form),
      input.answers,
      entries.map((e) => e.field),
    );
    if (Object.keys(checked.errors).length)
      return privateJson(
        { message: "Review highlighted fields.", fields: checked.errors },
        422,
      );

    const cleaning =
      form.template.kind === "equipment_cleaning"
        ? cleaningPayload(form, checked.answers)
        : null;
    const storedAnswers = cleaning
      ? Object.fromEntries(
          form.template.fields.map((f) => [
            f.id,
            f.binding && cleaning.fields[f.binding] !== undefined
              ? cleaning.fields[f.binding]
              : checked.answers[f.id],
          ]),
        )
      : checked.answers;
    const files = [];
    if (entries.length) {
      const bucket = await client.storage.getBucket("form-attachments");
      if (bucket.data?.public) throw Error("File storage must be private.");
      if (bucket.error) {
        const made = await client.storage.createBucket("form-attachments", {
          public: false,
          fileSizeLimit: 2000000,
          allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
        });
        if (made.error && !/exists|duplicate/i.test(made.error.message))
          throw Error("File storage is unavailable.");
      }
    }
    for (const e of entries) {
      const path =
        token + "/" + input.request_key + "/" + randomUUID() + "." + e.ext;
      const result = await client.storage
        .from("form-attachments")
        .upload(path, e.bytes, { contentType: e.mime, upsert: false });
      if (result.error) throw Error("Could not upload file. Retry.");
      paths.push(path);
      files.push({
        field: e.field,
        path,
        name: e.file.name.slice(0, 200),
        mime: e.mime,
        size: e.file.size,
      });
    }
    const result = await client.rpc("erp_form_submit", {
      p_link: token,
      p_revision: input.revision,
      p_request: input.request_key,
      p_hash: hash,
      p_answers: storedAnswers,
      p_files: files,
      p_cleaning: cleaning,
      p_pass: cleaning ? inspectionPassed(cleaning.fields) : null,
    });
    if (result.error)
      throw Error(
        result.error.code === "P0001"
          ? result.error.message
          : "Could not save the form. Retry.",
      );
    if (!result.data.duplicate) committed = true;
    return privateJson(result.data);
  } catch (e) {
    return privateJson(
      {
        message:
          e instanceof z.ZodError || e instanceof SyntaxError
            ? "Review form values and refresh before retrying."
            : e instanceof Error
              ? e.message
              : "Could not submit the form.",
      },
      422,
    );
  } finally {
    if (!committed && paths.length) {
      try {
        await client.storage.from("form-attachments").remove(paths);
      } catch {
        console.error("Form attachment cleanup needs retry.");
      }
    }
  }
}

import QRCode from "qrcode";
import { requireUser } from "@/lib/auth";
import { erpRpc, erpError } from "@/lib/erp/server";
import { privateJson } from "@/lib/api-response";
import { z } from "zod";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireUser()))
    return privateJson({ message: "Session expired." }, 401);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return privateJson({ message: "Invalid form." }, 400);
  const result = await erpRpc("erp_forms_admin", {
    p_action: "detail",
    p_id: id,
  });
  if (result.error) return erpError(result.error);
  if (!result.data.active)
    return privateJson({ message: "Publish the form first." }, 422);
  const image = await QRCode.toBuffer(
    new URL("/forms/" + result.data.public_token, request.url).href,
    { width: 600, margin: 2, errorCorrectionLevel: "M" },
  );
  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="form-qr.png"',
    },
  });
}

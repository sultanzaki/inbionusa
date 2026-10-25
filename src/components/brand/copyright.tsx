import { Localized } from "@/components/i18n/locale-provider";
import { cacheLife } from "next/cache";

export async function Copyright() {
  "use cache";
  cacheLife("hours");
  const year = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  return (
    <span>
      <Localized>{"Copyright "}</Localized>
      {year} <Localized>{" PT Inovasi Biokem Nusantara."}</Localized>
    </span>
  );
}

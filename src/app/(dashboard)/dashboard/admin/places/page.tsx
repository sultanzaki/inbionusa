import type { Metadata } from "next";
import { PlacesAdmin } from "@/components/places/places-admin";
export const metadata: Metadata = {
  title: { absolute: "Sites & rooms | INBIONUSA" },
};
export default function Page() {
  return <PlacesAdmin />;
}

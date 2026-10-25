"use client";
import { Localized } from "@/components/i18n/locale-provider";

import { Button } from "@/components/ui/button";
export function SaveStatus({
  uncertain,
  onChecked,
}: {
  uncertain: boolean;
  onChecked: () => void;
}) {
  if (!uncertain) return null;
  return (
    <aside className="save-uncertain" role="alert">
      <strong>
        <Localized>{"Save outcome not confirmed"}</Localized>
      </strong>
      <p>
        <Localized>
          {
            " The server may have saved this transaction. Check the record and its history before sending it again. Your recovery draft is kept on this device. "
          }
        </Localized>
      </p>
      <Button variant="outline" size="sm" onClick={onChecked}>
        <Localized>{" I checked the record — enable retry "}</Localized>
      </Button>
    </aside>
  );
}

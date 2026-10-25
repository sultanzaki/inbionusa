"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SlideConfirm } from "@/components/ui/slide-confirm";
import { ExternalLink } from "lucide-react";
export function PdfPreview({
  url,
  onClose,
  onIssue,
  busy,
}: {
  url: string | null;
  onClose: () => void;
  onIssue: () => Promise<void>;
  busy: boolean;
}) {
  const { t: localize } = useLocale();

  return (
    <Dialog
      open={Boolean(url)}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="pdf-preview-dialog">
        <DialogHeader>
          <DialogTitle>
            <Localized>{"Preview COA"}</Localized>
          </DialogTitle>
          <DialogDescription>
            <Localized>
              {
                " Not issued yet. The certificate number is assigned on issuance. "
              }
            </Localized>
          </DialogDescription>
        </DialogHeader>
        {url && (
          <>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs text-primary"
            >
              <Localized>{" Open preview in a new tab "}</Localized>
              <ExternalLink className="size-3.5" />
            </a>
            <iframe
              title={localize("Certificate PDF preview")}
              src={url + "#toolbar=0"}
              className="pdf-preview-frame"
            />
          </>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            <Localized>{" Back to editing "}</Localized>
          </Button>
          <SlideConfirm
            label="Issue COA"
            busy={busy}
            disabled={!url}
            resetKey={url || ""}
            onConfirm={() => void onIssue()}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

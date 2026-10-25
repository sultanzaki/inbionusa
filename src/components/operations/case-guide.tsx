"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { useWorkRecords } from "./data";
import { RecordSkeleton } from "@/components/workspace/record-loading";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock3 } from "lucide-react";
export function CaseGuide({ id, version }: { id: string; version: number }) {
  const { t: localize } = useLocale();

  const result = useWorkRecords("case_progress", { id, version });
  const steps = result.data.rows[0]?.steps as
    { title: string; done: boolean; hint: string }[] | undefined;
  return (
    <section
      className="work-case-guide"
      aria-label={localize("Case resolution checklist")}
    >
      <h3>
        <Localized>{"Resolution checklist"}</Localized>
      </h3>
      {result.loading ? (
        <RecordSkeleton compact label="Checking case requirements…" />
      ) : result.error ? (
        <p role="alert">
          <Localized>{result.error}</Localized>
          <Button size="sm" variant="outline" onClick={result.refresh}>
            <Localized>{" Retry checklist "}</Localized>
          </Button>
        </p>
      ) : (
        <ol>
          {steps?.map((step, index) => (
            <li key={step.title} data-done={step.done}>
              <span>
                {step.done ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Clock3 className="size-4" />
                )}
              </span>
              <div>
                <strong>
                  {index + 1}. <Localized>{step.title}</Localized>
                </strong>
                <p>{step.hint}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

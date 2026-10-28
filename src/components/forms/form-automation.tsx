"use client";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  cleaningTargets,
  cleaningAnswerLabels,
  type IntegrationIssue,
} from "@/lib/forms/cleaning-template";
import {
  answerMeaning,
  type Template,
  type FormField,
} from "@/lib/forms/schema";
import { Button } from "@/components/ui/button";
const control =
  "mt-1.5 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2.5 text-sm";
export function FormAutomation({
  template,
  disabled,
  onChange,
  issues,
}: {
  template: Template;
  disabled: boolean;
  onChange: (template: Template) => void;
  issues: IntegrationIssue[];
}) {
  const { t } = useLocale();
  return (
    <details
      className="min-w-0 rounded-lg border bg-background p-4"
      open={issues.length ? true : undefined}
    >
      <summary className="cursor-pointer text-sm font-medium">
        {t("Form automation")} ·{" "}
        {t(
          template.kind === "equipment_cleaning"
            ? "Equipment cleaning"
            : "None",
        )}
      </summary>
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium">
          {t("On submission")}
          <select
            aria-label={t("Form automation")}
            className={control}
            value={template.kind}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...template,
                kind: e.target.value as Template["kind"],
              })
            }
          >
            <option value="general">{t("Save response only")}</option>
            <option value="equipment_cleaning">
              {t("Record equipment cleaning")}
            </option>
          </select>
        </label>
        {template.kind === "equipment_cleaning" && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(
              "Map questions and answer meanings to update equipment readiness. Validation runs before publishing.",
            )}
          </p>
        )}
        {issues.length > 0 && (
          <ul
            role="alert"
            className="space-y-2 break-words text-sm text-destructive"
          >
            {issues.map((issue, i) => (
              <li key={i}>{t(issue.message)}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
export function FieldAutomation({
  field,
  disabled,
  onChange,
}: {
  field: FormField;
  disabled: boolean;
  onChange: (change: Partial<FormField>) => void;
}) {
  const { t } = useLocale(),
    target = cleaningTargets.find((target) => target.binding === field.binding);
  return (
    <div className="min-w-0 space-y-3 rounded-lg border bg-primary/5 p-3">
      <label className="block text-sm font-medium">
        {t("Use answer for")}
        <select
          aria-label={t("Use answer for")}
          className={control}
          value={field.binding || ""}
          disabled={disabled}
          onChange={(e) => {
            const next = cleaningTargets.find(
              (target) => target.binding === e.target.value,
            );
            onChange(
              next
                ? {
                    binding: next.binding,
                    ...(next.required ? { required: true } : {}),
                    type: next.types[0],
                    source: next.source,
                    options: next.options.map(
                      (value) => cleaningAnswerLabels[value] || value,
                    ),
                    value_map: next.options.length
                      ? Object.fromEntries(
                          next.options.map((value) => [
                            cleaningAnswerLabels[value] || value,
                            value,
                          ]),
                        )
                      : undefined,
                  }
                : { binding: undefined, value_map: undefined },
            );
          }}
        >
          <option value="">{t("Response only")}</option>
          {cleaningTargets.map((target) => (
            <option key={target.binding} value={target.binding}>
              {t(target.label)}
              {target.required ? " *" : ""}
            </option>
          ))}
        </select>
      </label>
      {target?.source && field.type !== "reference" && (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange({
              type: "reference",
              source: target.source as FormField["source"],
              options: [],
            })
          }
        >
          {t("Use ERP reference")}
        </Button>
      )}
      {target && target.options.length > 0 && field.type === "select" && (
        <div className="space-y-3">
          <p className="text-xs font-semibold">{t("Answer meanings")}</p>
          {field.options
            .filter((o) => o.trim())
            .map((option, i) => (
              <label
                key={i}
                className="block min-w-0 break-words text-xs font-medium"
              >
                {option}
                <select
                  aria-label={t("Meaning of") + " " + option}
                  className={control}
                  disabled={disabled}
                  value={
                    target.options.includes(answerMeaning(field, option))
                      ? answerMeaning(field, option)
                      : ""
                  }
                  onChange={(e) =>
                    onChange({
                      value_map: {
                        ...field.value_map,
                        [option]: e.target.value,
                      },
                    })
                  }
                >
                  <option value="">{t("Select meaning…")}</option>
                  {target.options.map((value) => (
                    <option key={value} value={value}>
                      {t(cleaningAnswerLabels[value] || value)}
                      {target.passOptions.length
                        ? " · " +
                          t(
                            target.passOptions.includes(value)
                              ? "Pass"
                              : "Fail",
                          )
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </div>
      )}
    </div>
  );
}

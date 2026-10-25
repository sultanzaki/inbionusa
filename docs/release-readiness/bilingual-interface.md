# Bilingual interface and mobile release

## Operator behavior

- Choose English or Bahasa Indonesia in the account menu. The browser remembers the choice. Changing language does not clear form values or alter stored transaction values.
- PDF language remains controlled by the document's existing language setting. UI language does not change issued document content or historical snapshots.
- Mobile navigation uses workspace → category → page. The current page's category opens automatically; permissions still determine the available destinations.
- Mobile login follows the saved language/theme without showing preference controls. It supports narrow screens, landscape, password managers, and browser zoom. Page entrance motion respects the operating system's reduced-motion preference.
- Internal approval stamps are removed from generated ERP and operations PDFs. Audit history, document permissions, approval requirements and delivery-recipient signature fields remain.

## Translation maintenance

Interface text is explicit React content, translated using `Localized` / `useLocale` and `src/lib/i18n/id.ts`. There is no DOM mutation or remote translation service. English remains the default and the fallback for a newly added message. Product/customer names, references, user-authored notes and numerical transport values must not be translated. Toast messages and known validation/business errors use the same dictionary. New UI text requires a dictionary entry and appropriate wrapping; document templates have their own language flow.

Language preference is browser-local (`inb:locale`), not an account setting synchronized between devices. Server-rendered markup starts in English and the stored preference is restored during hydration; this preserves the existing static/PPR caching behavior without reading cookies on every page. Native date-control presentation follows the browser/OS locale.

## Business protections

See [business-edge-cases.md](business-edge-cases.md) for the process map, existing database protections and added field-level checks. No database migration is required for this release. Tests use a disposable local integration database; no production records were modified.

## Verification — 25 October 2026

- `npm test`: 51 passing unit tests.
- `npm run test:db`: 135 passing local integration scenarios.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `npm run test:e2e`: full authenticated browser regression passed (approximately 6.5 minutes), including accessibility, numeric entry, transactions, PDF downloads, narrow layouts, session failures and logout.
- Additional browser runs with `TEST_BILINGUAL_ONLY=1`, `TEST_INTERACTIONS_ONLY=1` and `TEST_OPERATIONS_ONLY=1`: passed.

Browser artifacts are retained in the execution workspace under `/workspace/bilingual-release-review` and `/workspace/bilingual-full-review`. These checks do not replace a company acceptance test against real operating procedures.

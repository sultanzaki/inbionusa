"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Menu,
  ArrowUpRight,
} from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  navigationSections,
  workspaceLinkActive,
} from "@/lib/workspace/navigation";
import { useWorkspaceGroups } from "./workspace-navigation";

type Destination = string[];
/** Mobile console navigation shares desktop permissions and keeps both levels explicit. */
export function MobileConsoleNavigation({
  onSearch,
  account,
}: {
  onSearch: () => void;
  account: ReactNode;
}) {
  const { t: localize } = useLocale();

  const groups = useWorkspaceGroups(),
    path = usePathname(),
    params = useSearchParams();
  const [workspaceOpen, setWorkspaceOpen] = useState(false),
    [pagesOpen, setPagesOpen] = useState(false);
  const view =
    params.get("view") ||
    (path.endsWith("warehouse")
      ? "stock"
      : path.endsWith("sales")
        ? "quotes"
        : path.endsWith("purchase")
          ? "purchases"
          : path.endsWith("crm")
            ? "opportunities"
            : path.endsWith("materials")
              ? "material_stock"
              : "modules");
  function active(href: string) {
    return workspaceLinkActive(href, path, params.get("view"));
  }
  const current =
    groups.find((g) => g.links.some(([, href]) => active(href))) ||
    (path.endsWith("settings") && view === "units"
      ? groups.find((g) => g.name === "Master data")
      : undefined) ||
    groups[0];
  const pages: Destination[] = current.links.flatMap(([label, href]) =>
    href.endsWith("?view=catalog")
      ? [
          ["Units", "/dashboard/admin/settings?view=units"],
          ["Product conversions", href],
        ]
      : [[label, href]],
  );
  const page =
    pages.find(([, href]) => active(href))?.[0] ||
    (path.endsWith("/work") ? "Workspaces" : "Workspace");
  return (
    <nav
      className="mobile-console-header"
      aria-label={localize("Mobile navigation")}
    >
      <div className="mobile-console-bar">
        <Link
          href="/dashboard"
          className="mobile-console-brand"
          aria-label={localize("INBIONUSA home")}
        >
          <Image src="/logo.png" alt="" width={28} height={28} priority />
        </Link>
        <span className="mobile-console-divider" aria-hidden="true">
          /
        </span>
        <Popover open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="mobile-workspace-trigger"
                aria-label={localize("Switch workspace")}
              />
            }
          >
            <span>
              <Localized>{current.name}</Localized>
            </span>
            <ChevronsUpDown aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent
            collisionPadding={12}
            label="Workspaces"
            className="mobile-console-menu mobile-workspace-menu"
          >
            <p className="mobile-menu-caption">
              <Localized>{"WORKSPACES"}</Localized>
            </p>
            <div className="mobile-menu-scroll">
              {groups.map(({ name, icon: Icon, links }) => (
                <Link
                  key={name}
                  href={links[0][1]}
                  className="mobile-workspace-option"
                  aria-current={name === current.name ? "true" : undefined}
                  onClick={() => setWorkspaceOpen(false)}
                >
                  <span className="mobile-workspace-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <span>
                    <Localized>{name}</Localized>
                  </span>
                  {name === current.name && (
                    <Check className="mobile-menu-check" aria-hidden="true" />
                  )}
                </Link>
              ))}
            </div>
            <Link
              className="mobile-menu-footer"
              href="/dashboard/workspaces"
              onClick={() => setWorkspaceOpen(false)}
            >
              <Localized>{" All workspaces "}</Localized>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </PopoverContent>
        </Popover>
        <div className="mobile-console-actions">
          <button
            type="button"
            className="mobile-console-icon"
            aria-label={localize("Search")}
            onClick={onSearch}
          >
            <Search aria-hidden="true" />
          </button>
          {account}
        </div>
      </div>
      <div className="mobile-console-location">
        <Popover open={pagesOpen} onOpenChange={setPagesOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                className="mobile-page-trigger"
                aria-label={localize("Choose page")}
              />
            }
          >
            <Menu aria-hidden="true" />
            <span>
              <Localized>{page}</Localized>
            </span>
            <ChevronDown aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent
            collisionPadding={16}
            label="Workspace pages"
            className="mobile-console-menu mobile-page-menu"
          >
            <p className="mobile-menu-caption">
              <Localized>{current.name}</Localized>
            </p>
            <div className="mobile-menu-scroll">
              {navigationSections(current.name, pages).map((section) =>
                section.name ? (
                  <details
                    className="mobile-page-group"
                    key={section.name}
                    open={section.links.some(([, href]) => active(href))}
                  >
                    <summary>
                      <Localized>{section.name}</Localized>
                      <ChevronDown aria-hidden="true" />
                    </summary>
                    <div>
                      {section.links.map(([label, href]) => (
                        <Link
                          href={href}
                          key={href}
                          aria-current={active(href) ? "page" : undefined}
                          onClick={() => setPagesOpen(false)}
                        >
                          <span>
                            <Localized>{label}</Localized>
                          </span>
                          {active(href) && (
                            <Check
                              className="mobile-menu-check"
                              aria-hidden="true"
                            />
                          )}
                        </Link>
                      ))}
                    </div>
                  </details>
                ) : (
                  <div key="pages">
                    {section.links.map(([label, href]) => (
                      <Link
                        href={href}
                        key={href}
                        aria-current={active(href) ? "page" : undefined}
                        onClick={() => setPagesOpen(false)}
                      >
                        <span>
                          <Localized>{label}</Localized>
                        </span>
                        {active(href) && (
                          <Check
                            className="mobile-menu-check"
                            aria-hidden="true"
                          />
                        )}
                      </Link>
                    ))}
                  </div>
                ),
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}

"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import Link from "next/link";
import { useState } from "react";
import {
  navigationSections,
  workspaceLinkActive,
} from "@/lib/workspace/navigation";
import { Input } from "@/components/ui/input";
import { usePathname, useSearchParams } from "next/navigation";
import { useERP } from "@/components/erp/context";
import { useUser } from "@/app/(dashboard)/user-context";
import { canAction } from "@/lib/types";
import {
  ArrowRight,
  ChevronDown,
  Factory,
  FlaskConical,
  Warehouse,
  Handshake,
  Database,
  Settings2,
  LayoutDashboard,
  Inbox,
  ShoppingCart,
  ContactRound,
  Files,
  WalletCards,
  LifeBuoy,
} from "lucide-react";
export function useWorkspaceGroups() {
  const erp = useERP(),
    { user } = useUser();
  return [
    {
      name: "Overview",
      description: "Tasks and performance",
      icon: LayoutDashboard,
      links: [
        ["Home", "/dashboard"],
        ["Inbox", "/dashboard/inbox"],
      ],
    },
    ...(erp.can("production")
      ? [
          {
            name: "Production",
            description: "Formulas, material usage and finished batches",
            icon: Factory,
            links: [
              ["Production orders", "/dashboard/production/orders"],
              ["Equipment & cleaning", "/dashboard/production/equipment"],
              ["Formulas & BOM", "/dashboard/production/formulas"],
              ["Production records", "/dashboard/production"],
            ],
          },
        ]
      : []),
    ...(erp.can("quality")
      ? [
          {
            name: "Quality",
            description: "Inspections and certificates",
            icon: FlaskConical,
            links: [
              ["Inspections", "/dashboard/quality/inspections"],
              [
                "Incoming inspections",
                "/dashboard/quality/incoming-inspections",
              ],
              [
                "Material lots & disposition",
                "/dashboard/quality/material-lots",
              ],
              [
                "Material specifications",
                "/dashboard/quality/material-specifications",
              ],
              [
                "Material release policies",
                "/dashboard/quality/material-policies",
              ],
              ["Approved suppliers", "/dashboard/quality/approved-suppliers"],
              ["Deviations", "/dashboard/quality/deviations"],
              ["CAPA actions", "/dashboard/quality/capa"],
              ["Certificates", "/dashboard/quality/certificates"],
              ["Quality analytics", "/dashboard/quality"],
            ],
          },
        ]
      : []),
    ...(erp.can("warehouse")
      ? [
          {
            name: "Warehouse",
            description: "Stock, traceability and dispatch",
            icon: Warehouse,
            links: [
              ["Inventory by warehouse", "/dashboard/warehouse/inventory"],
              ["Pallet tracking", "/dashboard/warehouse/pallets"],
              ["Warehouse transfers", "/dashboard/warehouse/transfers"],
              ["Stock", "/dashboard/warehouse?view=stock"],
              ["Movements", "/dashboard/warehouse?view=movements"],
              ["Stock counts", "/dashboard/warehouse?view=counts"],
              ["Lots & traceability", "/dashboard/warehouse?view=lots"],
              ["Dispatch", "/dashboard/warehouse?view=fulfillment"],
              ["Returns", "/dashboard/warehouse?view=returns"],
              ["Stock ledger", "/dashboard/warehouse?view=ledger"],
              ["Material stock", "/dashboard/warehouse/material-inventory"],
              [
                "Material ledger",
                "/dashboard/warehouse/materials?view=material_ledger",
              ],
            ],
          },
        ]
      : []),
    ...(erp.can("purchase")
      ? [
          {
            name: "Purchase",
            description: "Suppliers and raw material purchasing",
            icon: ShoppingCart,
            links: [
              ["Purchase orders", "/dashboard/purchase?view=purchases"],
              ["Suppliers", "/dashboard/purchase?view=suppliers"],
              ["Raw materials", "/dashboard/purchase?view=materials"],
            ],
          },
        ]
      : []),
    ...(erp.can("finance")
      ? [
          {
            name: "Finance",
            description: "Billing, payments and credit control",
            icon: WalletCards,
            links: [
              ["Invoices & billing", "/dashboard/finance"],
              ["Payments", "/dashboard/finance?view=payments"],
              ["Dispatch clearance", "/dashboard/finance?view=orders"],
              ["Purchase matching", "/dashboard/finance?view=purchases"],
              ["Customer credit", "/dashboard/finance?view=credit_policies"],
              ["AR / AP aging", "/dashboard/finance?view=aging"],
            ],
          },
        ]
      : []),
    ...(erp.can("service")
      ? [
          {
            name: "Service & exceptions",
            description: "Claims, receipt evidence and resolution",
            icon: LifeBuoy,
            links: [
              ["Cases", "/dashboard/service"],
              ["Customer receipts", "/dashboard/service?view=receipts"],
              ["Material holds", "/dashboard/service?view=material_stock"],
              ...(erp.data?.admin
                ? [["Operating policy", "/dashboard/service?view=policy"]]
                : []),
            ],
          },
        ]
      : []),
    ...(erp.can("crm")
      ? [
          {
            name: "CRM",
            description: "Opportunities and follow-up",
            icon: ContactRound,
            links: [
              ["Pipeline", "/dashboard/crm?view=opportunities"],
              ["Activities", "/dashboard/crm?view=crm_activities"],
              ["Customer samples", "/dashboard/crm/samples"],
              ["Customer interactions", "/dashboard/crm/interactions"],
              ["Document distribution", "/dashboard/crm/documents"],
            ],
          },
        ]
      : []),
    ...(erp.can("documents")
      ? [
          {
            name: "Product documents",
            description: "SDS, TDS and controlled revisions",
            icon: Files,
            links: [
              ["Product documents", "/dashboard/product-documents"],
              [
                "Material & supplier documents",
                "/dashboard/product-documents/materials",
              ],
            ],
          },
        ]
      : []),
    ...(erp.can("sales")
      ? [
          {
            name: "Sales",
            description: "Quotations, orders and customers",
            icon: Handshake,
            links: [
              ["Quotations", "/dashboard/sales?view=quotes"],
              ["Sales orders", "/dashboard/sales?view=orders"],
              ["Customers", "/dashboard/sales?view=customers"],
            ],
          },
        ]
      : []),
    {
      name: "Master data",
      description: "Products, units and locations",
      icon: Database,
      links: [
        ["Products", "/dashboard/master-data/products"],
        ...(erp.data?.admin
          ? [
              ["Product series", "/dashboard/admin/settings?view=series"],
              ["Units & conversions", "/dashboard/admin/settings?view=catalog"],
            ]
          : []),
      ],
    },
    ...(canAction(user || "viewer", "manage_users")
      ? [
          {
            name: "Administration",
            description: "People, access and configuration",
            icon: Settings2,
            links: [
              ["Users", "/dashboard/admin/users"],
              ["Forms", "/dashboard/admin/forms"],
              ["Sites & rooms", "/dashboard/admin/places"],
              ["Access", "/dashboard/admin/settings?view=access"],
              ["Site access", "/dashboard/admin/settings/warehouse-access"],
              ["Module settings", "/dashboard/admin/settings?view=modules"],
              ["Audit log", "/dashboard/admin/audit-log"],
            ],
          },
        ]
      : []),
  ];
}
export function WorkspaceDirectory() {
  const { t: localize } = useLocale();

  const groups = useWorkspaceGroups();
  return (
    <div className="page-stack work-directory">
      <div>
        <p className="micro-label">
          <Localized>{"WORKSPACE"}</Localized>
        </p>
        <h1>
          <Localized>{"All workspaces"}</Localized>
        </h1>
      </div>
      <nav
        className="workspace-launcher"
        aria-label={localize("All workspaces")}
      >
        {groups.map(({ name, description, icon: Icon, links }) => (
          <Link key={name} href={links[0][1]} className="workspace-tile">
            <span className="workspace-tile-icon">
              <Icon aria-hidden="true" />
            </span>
            <strong>
              <Localized>{name}</Localized>
            </strong>
            <span className="workspace-tile-description">
              <Localized>{description}</Localized>
            </span>
            <ArrowRight className="workspace-tile-arrow" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
export function WorkspaceSidebar({ collapsed }: { collapsed: boolean }) {
  const { t: localize } = useLocale();

  const groups = useWorkspaceGroups(),
    path = usePathname(),
    params = useSearchParams();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<{
    route: string;
    name: string | null;
  } | null>(null);
  const route = path + "?" + params.toString();
  function active(href: string) {
    return workspaceLinkActive(href, path, params.get("view"));
  }
  if (collapsed)
    return (
      <nav
        aria-label={localize("Main navigation")}
        className="workspace-sidebar-nav collapsed-navigation"
      >
        {groups.map(({ name, icon: Icon, links }) => (
          <Link
            href={links[0][1]}
            key={name}
            title={localize(name)}
            aria-label={localize(name)}
          >
            <Icon className="size-5" />
          </Link>
        ))}
      </nav>
    );
  const query = search.trim().toLowerCase();
  const activeModule = groups.find((group) =>
    group.links.some(([, href]) => active(href)),
  )?.name;
  const openModule = expanded?.route === route ? expanded.name : activeModule;
  const matches = (label: string) =>
    [label, localize(label)].some((value) =>
      value.toLowerCase().includes(query),
    );
  const filtered = groups
    .map((group) => ({
      ...group,
      links:
        query && !matches(group.name)
          ? group.links.filter(([label]) => matches(label))
          : group.links,
    }))
    .filter((group) => group.links.length);
  return (
    <nav
      aria-label={localize("Main navigation")}
      className="workspace-sidebar-nav"
    >
      <div className="sidebar-page-search">
        <Input
          type="search"
          aria-label={localize("Find a page")}
          placeholder={localize("Find a page…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {!filtered.length && (
        <p className="sidebar-no-results">
          <Localized>{"No matching pages."}</Localized>
        </p>
      )}
      {filtered.map(({ name, icon: Icon, links }) => (
        <details key={name} open={Boolean(query) || openModule === name}>
          <summary
            title={localize(name)}
            onClick={(event) => {
              event.preventDefault();
              setExpanded({ route, name: openModule === name ? null : name });
            }}
          >
            <Icon className="size-4" />
            <span>
              <Localized>{name}</Localized>
            </span>
            <ChevronDown className="sidebar-chevron" aria-hidden="true" />
          </summary>
          <div>
            {navigationSections(name, links).map((section) => {
              const pages = section.links.map(([label, href]) => (
                <Link
                  title={label}
                  key={href}
                  href={href}
                  aria-current={active(href) ? "page" : undefined}
                  onClick={() => setSearch("")}
                >
                  <Localized>{label}</Localized>
                </Link>
              ));
              return section.name ? (
                <details
                  className="sidebar-section"
                  key={route + section.name + query}
                  open={
                    Boolean(query) ||
                    section.links.some(([, href]) => active(href)) ||
                    undefined
                  }
                >
                  <summary>
                    <Localized>{section.name}</Localized>
                    <ChevronDown
                      className="sidebar-chevron"
                      aria-hidden="true"
                    />
                  </summary>
                  <div>{pages}</div>
                </details>
              ) : (
                <div className="sidebar-direct-pages" key="pages">
                  {pages}
                </div>
              );
            })}
          </div>
        </details>
      ))}
      <Link className="sidebar-inbox" href="/dashboard/workspaces">
        <LayoutDashboard className="size-4" />
        <span>
          <Localized>{"All workspaces"}</Localized>
        </span>
      </Link>
      <Link className="sidebar-inbox" href="/dashboard/inbox">
        <Inbox className="size-4" />
        <span>
          <Localized>{"Work inbox"}</Localized>
        </span>
      </Link>
    </nav>
  );
}

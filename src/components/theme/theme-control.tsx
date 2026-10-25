"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { Menu } from "@base-ui/react/menu";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { t: localize, locale, setLocale } = useLocale();

  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const options = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "system", label: "System", icon: Monitor },
  ];
  if (compact)
    return (
      <>
        <div className="theme-control theme-control-compact language-menu-control">
          <span>{localize("Language")}</span>
          <Menu.RadioGroup
            aria-label={localize("Language")}
            value={locale}
            onValueChange={(value) => setLocale(value === "id" ? "id" : "en")}
          >
            <Menu.RadioItem
              value="en"
              render={<button type="button" />}
              closeOnClick={false}
            >
              English
            </Menu.RadioItem>
            <Menu.RadioItem
              value="id"
              render={<button type="button" />}
              closeOnClick={false}
            >
              Bahasa Indonesia
            </Menu.RadioItem>
          </Menu.RadioGroup>
        </div>
        <div className="theme-control theme-control-compact">
          <span>
            <Localized>{"Appearance"}</Localized>
          </span>
          <Menu.RadioGroup
            aria-label={localize("Appearance")}
            value={mounted ? theme : undefined}
            onValueChange={setTheme}
          >
            {options.map(({ key, label, icon: Icon }) => (
              <Menu.RadioItem
                key={key}
                value={key}
                render={<button type="button" />}
                aria-label={localize(`${label} theme`)}
                closeOnClick={false}
              >
                <Icon aria-hidden="true" />
                <span>
                  <Localized>{label}</Localized>
                </span>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </div>
      </>
    );
  return (
    <div
      className={"theme-control" + (compact ? " theme-control-compact" : "")}
    >
      <span>
        <Localized>{"Appearance"}</Localized>
      </span>
      <div role="group" aria-label={localize("Appearance")}>
        {options.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-label={localize(`${label} theme`)}
            title={localize(label)}
            aria-pressed={mounted && theme === key}
            onClick={() => setTheme(key)}
          >
            <Icon aria-hidden="true" />
            <span>
              <Localized>{label}</Localized>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

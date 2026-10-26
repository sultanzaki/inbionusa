"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { LockKeyhole, ShieldCheck, Settings2 } from "lucide-react";
import { Localized, useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/workspace/confirm-provider";
import { saveRequest } from "@/lib/save-request";
import { invalidateERPReads } from "@/lib/erp/read-request";
import { bomPasswordError } from "@/lib/bom-security";
import type { WorkRow } from "@/lib/operations/catalog";
type Person = { id: string; name: string };
type Access = {
  server_time: string;
  root_id: string;
  formula_id: string;
  owner: boolean;
  can_recover: boolean;
  allowed: boolean;
  initialized: boolean;
  unlocked: boolean;
  expires_at: string | null;
  owner_name: string;
  grants: Person[];
  candidates: Person[];
};
function broadcast() {
  window.dispatchEvent(new Event("inb:bom-access"));
  if (typeof BroadcastChannel !== "undefined") {
    const c = new BroadcastChannel("inb:bom-access");
    c.postMessage("changed");
    c.close();
  }
}
export function BomAccessBoundary({
  enabled,
  ...props
}: {
  enabled: boolean;
  row: WorkRow;
  onChanged: () => void;
  children: ReactNode;
}) {
  return enabled ? <BomAccess {...props} /> : props.children;
}
export function BomAccess({
  row,
  onChanged,
  children,
}: {
  row: WorkRow;
  onChanged: () => void;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const id = useId(),
    confirm = useConfirm();
  const formula = String(row.bom_formula_id || row.formula_id || row.id);
  const [status, setStatus] = useState<Access | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [manage, setManage] = useState(false);
  const [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState("");
  const [person, setPerson] = useState(""),
    [reason, setReason] = useState("");
  const latest = useRef(onChanged);
  useEffect(() => {
    latest.current = onChanged;
  }, [onChanged]);
  const visibleUnlocked = row.bom_unlocked === true;
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    async function check() {
      try {
        const res = await fetch("/api/bom-security", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", formula_id: formula }),
          cache: "no-store",
          signal: abort.signal,
        });
        const data = await res.json();
        if (!res.ok)
          throw Error(data.message || "Could not verify BOM access.");
        if (!active) return;
        setStatus(data);
        setError("");
        if (visibleUnlocked && !data.unlocked) latest.current();
      } catch (e) {
        if (active) {
          setStatus(null);
          setError(
            e instanceof Error ? e.message : "Could not verify BOM access.",
          );
        }
      }
    }
    void check();
    const timer = setInterval(check, 30000);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("inb:bom-access")
        : null;
    if (channel) channel.onmessage = () => void check();
    const refresh = () => void check();
    window.addEventListener("inb:bom-access", refresh);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("inb:bom-access", refresh);
    };
  }, [formula, visibleUnlocked]);
  const unlocked = Boolean(
    status?.unlocked && visibleUnlocked && status.expires_at,
  );
  useEffect(() => {
    if (!status?.unlocked || !status.expires_at) return;
    const timer = setTimeout(
      () => {
        setStatus((s) => (s ? { ...s, unlocked: false } : null));
        setPassword("");
        setRepeat("");
        latest.current();
      },
      Math.max(
        0,
        Date.parse(status.expires_at) - Date.parse(status.server_time),
      ) + 30,
    );
    return () => clearTimeout(timer);
  }, [status?.unlocked, status?.expires_at, status?.server_time]);
  async function act(action: string, user_id?: string) {
    if (busy) return;
    if (["setup", "rotate"].includes(action)) {
      const message =
        bomPasswordError(password) ||
        (password !== repeat ? "BOM passwords do not match." : null);
      if (message) {
        setError(message);
        return;
      }
    }
    if (
      ["recover", "revoke", "rotate"].includes(action) &&
      !(await confirm({
        title:
          action === "recover"
            ? "Reset BOM password?"
            : action === "revoke"
              ? "Revoke BOM access?"
              : "Change BOM password?",
        description:
          action === "recover"
            ? "All unlocks will be revoked. Only the BOM owner can set the replacement password."
            : "Existing access will be checked again before the next protected operation.",
        confirmLabel: action === "revoke" ? "Revoke access" : "Continue",
        destructive: action !== "rotate",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const data = await saveRequest<Access>("/api/bom-security", {
        action,
        formula_id: formula,
        ...(["setup", "unlock", "rotate"].includes(action) ? { password } : {}),
        ...(user_id ? { user_id } : {}),
        ...(action === "recover" ? { reason } : {}),
      });
      setStatus(data);
      setPassword("");
      setRepeat("");
      setReason("");
      setPerson("");
      invalidateERPReads();
      broadcast();
      if (!["grant", "revoke"].includes(action)) latest.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update BOM access.");
    } finally {
      setBusy(false);
    }
  }
  const passwordFields = (setting: boolean) => (
    <>
      <label htmlFor={id + "-password"}>
        <Localized>{setting ? "New BOM password" : "BOM password"}</Localized>
      </label>
      <Input
        id={id + "-password"}
        name="bom_unlock_password"
        type="password"
        autoComplete={setting ? "new-password" : "off"}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError("");
        }}
        maxLength={64}
        disabled={busy}
        required
      />
      {setting && (
        <>
          <label htmlFor={id + "-repeat"}>
            <Localized>{"Confirm BOM password"}</Localized>
          </label>
          <Input
            id={id + "-repeat"}
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => {
              setRepeat(e.target.value);
              setError("");
            }}
            maxLength={64}
            disabled={busy}
            required
          />
          <small>
            <Localized>
              {
                "At least 16 characters. This password is not saved in browser drafts."
              }
            </Localized>
          </small>
        </>
      )}
    </>
  );
  return (
    <>
      <section className="bom-access" aria-label={t("Confidential BOM")}>
        <header>
          <span className="bom-access-icon">
            {unlocked ? (
              <ShieldCheck aria-hidden="true" />
            ) : (
              <LockKeyhole aria-hidden="true" />
            )}
          </span>
          <div>
            <strong>
              <Localized>
                {unlocked ? "BOM unlocked" : "Confidential BOM"}
              </Localized>
            </strong>
            <p>
              <Localized>
                {unlocked
                  ? "Access is limited to this signed-in session for 15 minutes."
                  : "The composition requires the owner's permission and a separate BOM password."}
              </Localized>
            </p>
          </div>
        </header>
        {!status && !error && (
          <p role="status">
            <Localized>{"Checking BOM access…"}</Localized>
          </p>
        )}
        {error && (
          <p role="alert" className="erp-error">
            <Localized>{error}</Localized>
          </p>
        )}
        {status && !unlocked && (
          <>
            <p>
              <Localized>{"BOM owner"}</Localized>: {status.owner_name}
            </p>
            {status.allowed && (status.initialized || status.owner) ? (
              <form
                className="bom-access-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(status.initialized ? "unlock" : "setup");
                }}
              >
                {passwordFields(!status.initialized)}
                <Button type="submit" loading={busy}>
                  <Localized>
                    {status.initialized ? "Unlock BOM" : "Set BOM password"}
                  </Localized>
                </Button>
              </form>
            ) : (
              <p>
                <Localized>
                  {status.allowed
                    ? "The BOM owner must set its password first."
                    : "Ask the BOM owner to grant you access. Production read permission is also required."}
                </Localized>
              </p>
            )}
          </>
        )}
        {unlocked && (
          <div className="bom-access-actions">
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() => void act("lock")}
            >
              <LockKeyhole />
              <Localized>{"Lock BOM"}</Localized>
            </Button>
            {status?.owner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setManage((v) => !v)}
                aria-expanded={manage}
              >
                <Settings2 />
                <Localized>{"Manage BOM access"}</Localized>
              </Button>
            )}
          </div>
        )}
        {status?.owner && unlocked && manage && (
          <div className="bom-access-management">
            <h3>
              <Localized>{"Authorized users"}</Localized>
            </h3>
            {status.grants.length === 0 && (
              <p>
                <Localized>{"Only the BOM owner has access."}</Localized>
              </p>
            )}
            <ul>
              {status.grants.map((user) => (
                <li key={user.id}>
                  <span>{user.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act("revoke", user.id)}
                  >
                    <Localized>{"Revoke access"}</Localized>
                  </Button>
                </li>
              ))}
            </ul>
            <form
              className="bom-access-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (person) void act("grant", person);
              }}
            >
              <label htmlFor={id + "-person"}>
                <Localized>{"Grant BOM access"}</Localized>
              </label>
              <select
                id={id + "-person"}
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                disabled={busy}
                required
              >
                <option value="">{t("Choose a user")}</option>
                {status.candidates
                  .filter((p) => !status.grants.some((g) => g.id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
              <Button type="submit" disabled={!person || busy}>
                <Localized>{"Grant access"}</Localized>
              </Button>
            </form>
            <details>
              <summary>
                <Localized>{"Change BOM password"}</Localized>
              </summary>
              <form
                className="bom-access-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("rotate");
                }}
              >
                {passwordFields(true)}
                <Button type="submit" loading={busy}>
                  <Localized>{"Change BOM password"}</Localized>
                </Button>
              </form>
            </details>
          </div>
        )}
        {status?.can_recover && !unlocked && (
          <details className="bom-recovery">
            <summary>
              <Localized>{"Administrator recovery"}</Localized>
            </summary>
            <p>
              <Localized>
                {
                  "Resetting does not reveal the password or composition. The owner must set a new password."
                }
              </Localized>
            </p>
            <form
              className="bom-access-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act("recover");
              }}
            >
              <label htmlFor={id + "-reason"}>
                <Localized>{"Recovery reason"}</Localized>
              </label>
              <Input
                id={id + "-reason"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={8}
                maxLength={500}
                disabled={busy}
                required
              />
              <Button type="submit" variant="outline" loading={busy}>
                <Localized>{"Reset BOM password"}</Localized>
              </Button>
            </form>
          </details>
        )}
      </section>
      {unlocked && children}
    </>
  );
}

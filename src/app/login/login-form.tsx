"use client";
import { Localized, useLocale } from "@/components/i18n/locale-provider";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
const initial: LoginState = {};
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      loading={pending}
      className="login-submit h-12 w-full justify-between px-4"
    >
      <span>
        {pending ? (
          <Localized>{"Opening workspace…"}</Localized>
        ) : (
          <Localized>{"Sign in"}</Localized>
        )}
      </span>
      {!pending && <ArrowRight className="size-4" />}
    </Button>
  );
}
export function LoginForm() {
  const { t: localize } = useLocale();

  const [state, action] = useActionState(loginAction, initial);
  const [show, setShow] = useState(false);
  return (
    <div className="login-form-card surface-enter">
      <h1>
        <Localized>{"Sign in"}</Localized>
      </h1>
      <form action={action} className="mt-8 space-y-5">
        <div className="space-y-2">
          <label htmlFor="username" className="text-xs font-semibold">
            <Localized>{" Username "}</Localized>
          </label>
          <div className="relative">
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              maxLength={100}
              placeholder={localize("Enter your username")}
              className="h-12 px-3.5"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-xs font-semibold">
            <Localized>{" Password "}</Localized>
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={1024}
              placeholder={localize("Enter your password")}
              className="h-12 pl-3.5 pr-12"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-alt hover:text-primary"
              aria-label={localize(show ? "Hide password" : "Show password")}
              aria-pressed={show}
            >
              {show ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </div>
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription id="login-error">
              <Localized>{state.error}</Localized>
            </AlertDescription>
          </Alert>
        )}
        <div className="pt-1">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}

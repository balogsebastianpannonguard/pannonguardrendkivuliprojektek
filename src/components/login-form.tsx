"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Field, inputClass } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { login, type LoginState } from "@/lib/auth-actions";

export function LoginForm({ notice, next }: { notice?: string; next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      {notice && !state.error && (
        <p className="rounded-xl border border-volt/20 bg-volt/8 px-4 py-3 text-sm text-volt-bright">{notice}</p>
      )}
      <Field label="E-mail-cím" icon={<Mail size={18} aria-hidden />}>
        <input name="email" type="email" defaultValue={state.email} autoComplete="username" autoFocus required className={inputClass} />
      </Field>
      <Field label="Jelszó" icon={<Lock size={18} aria-hidden />}>
        <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className={inputClass} />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? "Jelszó elrejtése" : "Jelszó megjelenítése"}
          className="rounded text-white/40 transition-colors hover:text-white"
        >
          {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </Field>
      <p role="alert" className="min-h-5 text-sm font-medium text-red-300">
        {state.error}
      </p>
      <SubmitButton pending={pending}>
        Belépés
        <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-1" />
      </SubmitButton>
      <p className="text-center text-xs text-white/40">Fiókot csak meghívóval lehet létrehozni.</p>
    </form>
  );
}

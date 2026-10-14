"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

const COOKIE = "ocultar-montos";

/** Ojito para ocultar o mostrar los montos de la pantalla. */
export function PrivacyToggle({ hidden }: { hidden: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    document.cookie = `${COOKIE}=${hidden ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
    start(() => router.refresh());
  }

  const label = hidden ? "Mostrar montos" : "Ocultar montos";
  return (
    <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={pending} aria-pressed={hidden} title={label}>
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 6.1A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.9M6.6 7.6A17 17 0 0 0 2.5 12S6 18 12 18c1.4 0 2.7-.3 3.8-.8" />
            <path d="M9.9 10a3 3 0 0 0 4.1 4.1" />
          </>
        ) : (
          <>
            <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
      {label}
    </Button>
  );
}

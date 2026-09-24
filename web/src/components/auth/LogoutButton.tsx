"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { postJson } from "@/lib/api-client";

export function LogoutButton() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await postJson("/auth/logout");
        router.replace("/login");
        router.refresh();
      }}
      className="inline-flex h-10 items-center rounded-control border border-line bg-surface px-3 text-label text-text hover:border-line-2 disabled:opacity-70"
    >
      {t("logout")}
    </button>
  );
}

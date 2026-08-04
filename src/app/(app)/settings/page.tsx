import type { Metadata } from "next";

import { NavBar } from "@/components/ui/nav-bar";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Risk tolerance, appearance, account and disclosures.",
};

export default function SettingsPage() {
  return (
    <>
      <NavBar title="Settings" largeTitle width="wide" />
      <main>
        <SettingsView />
      </main>
    </>
  );
}

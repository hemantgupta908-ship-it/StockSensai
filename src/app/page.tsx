import { redirect } from "next/navigation";

import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/destination";

export default function RootPage() {
  redirect(DEFAULT_SIGNED_IN_PATH);
}

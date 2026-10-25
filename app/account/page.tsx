import type { Metadata } from "next";
import { AccountPanel } from "@/components/AccountPanel";
import { requireViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireViewer("/account");
  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Account</span>
          <h1>Your account</h1>
        </div>
      </div>
      <AccountPanel user={user} />
    </div>
  );
}

import { notFound } from "next/navigation";
import { ExportCheck } from "@/app/dev/export/ExportCheck";

export default function DevExportPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="container" style={{ padding: "48px 0 96px" }}>
      <ExportCheck />
    </div>
  );
}

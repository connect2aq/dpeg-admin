"use client";
import AdminLayout from "@/components/AdminLayout";
import ExecutiveCopilotCard from "@/components/ExecutiveCopilotCard";
import { CopilotErrorBoundary } from "@/components/CopilotErrorBoundary";

export default function ExecutiveCopilotPage() {
  return (
    <AdminLayout>
      <div style={{ padding: "32px 36px" }}>
        <CopilotErrorBoundary>
          <ExecutiveCopilotCard />
        </CopilotErrorBoundary>
      </div>
    </AdminLayout>
  );
}

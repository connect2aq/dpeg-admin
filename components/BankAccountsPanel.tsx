"use client";

import { useState } from "react";
import { BankAccountPicker } from "./BankAccountPicker";

interface BankAccountsPanelProps {
  userId: number;
  isSuperAdmin: boolean;
}

export function BankAccountsPanel({ userId, isSuperAdmin }: BankAccountsPanelProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <BankAccountPicker
      userId={userId}
      isSuperAdmin={isSuperAdmin}
      selectedId={selectedId}
      onSelect={setSelectedId}
      description="This investor's saved payout/funding accounts. Selecting one has no effect here — use this to add, deactivate, reactivate, or reprioritize accounts."
    />
  );
}

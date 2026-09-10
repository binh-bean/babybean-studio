"use client";

import React, { useState } from "react";
import { Select } from "@/components/ui/select";
import { Building2 } from "lucide-react";

// Fake data for BB-021
const mockBranches = [
  { id: "1", name: "BabyBean Quận 1" },
  { id: "2", name: "BabyBean Quận 3" },
];

export function BranchSelector() {
  const [selected, setSelected] = useState(mockBranches[0]?.id || "");
  const isMultiBranch = mockBranches.length > 1;

  if (!isMultiBranch) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-[var(--bb-fg-muted)] hidden sm:block" />
      <Select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="h-9 min-h-[36px] w-[180px] text-sm"
        aria-label="Chọn chi nhánh"
      >
        {mockBranches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

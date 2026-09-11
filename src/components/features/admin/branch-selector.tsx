"use client";

import React, { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface Branch {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function BranchSelector() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function loadBranches() {
      try {
        const res = await fetch("/api/admin/branches", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;

        const list: Branch[] = (body?.data?.branches ?? []).filter(
          (b: Branch) => b.isActive !== false
        );
        setBranches(list);

        // Đọc chi nhánh từ query param hoặc localStorage
        const params = new URLSearchParams(window.location.search);
        const currentParam = params.get("branchId");
        const stored = localStorage.getItem("bb_admin_selected_branch");

        if (currentParam && list.some((b) => b.id === currentParam)) {
          setSelected(currentParam);
        } else if (stored && list.some((b) => b.id === stored)) {
          setSelected(stored);
        } else if (list.length > 0) {
          setSelected(list[0]?.id ?? "");
        }
      } catch (err) {
        console.error("Lỗi tải chi nhánh:", err);
      }
    }

    void loadBranches();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelected(val);
    if (val) {
      localStorage.setItem("bb_admin_selected_branch", val);
    } else {
      localStorage.removeItem("bb_admin_selected_branch");
    }

    // Phát custom event để các component khác (như danh sách album) có thể lắng nghe
    window.dispatchEvent(new CustomEvent("branchChange", { detail: val }));

    // Cập nhật query param trên URL
    const url = new URL(window.location.href);
    if (val) {
      url.searchParams.set("branchId", val);
    } else {
      url.searchParams.delete("branchId");
    }
    window.history.pushState({}, "", url.toString());
  };

  // Chỉ hiện khi người dùng phụ trách nhiều chi nhánh (spec docs/07-ui-ux.md §4)
  if (branches.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-[var(--bb-fg-muted)] hidden sm:block" />
      <Select
        name="branchId"
        value={selected}
        onChange={handleChange}
        className="h-9 min-h-[36px] w-[180px] text-sm"
        aria-label="Chọn chi nhánh"
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

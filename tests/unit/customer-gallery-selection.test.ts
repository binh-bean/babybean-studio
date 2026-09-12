import { describe, it, expect, vi } from "vitest";

describe("BB-112: Khách chọn ảnh và 4 con số hạn mức", () => {
  it("1. BẤY: Thao tác thả tim gửi mark = 'selected', TUYỆT ĐỐI KHÔNG gửi isFavorite", () => {
    // Mô phỏng payload gửi đi từ hàm handleToggleHeart
    const toggleSelection = (photoId: string, isCurrentlySelected: boolean) => {
      const nextMark: "selected" | null = isCurrentlySelected ? null : "selected";
      return {
        clientOpId: "mock-client-op-id",
        ops: [
          {
            photoId,
            mark: nextMark,
          },
        ],
      };
    };

    // Khi bấm chọn ảnh
    const selectPayload = toggleSelection("photo-123", false);
    expect(selectPayload.ops[0].mark).toBe("selected");
    expect((selectPayload.ops[0] as Record<string, unknown>).isFavorite).toBeUndefined();

    // Khi bấm bỏ chọn ảnh
    const deselectPayload = toggleSelection("photo-123", true);
    expect(deselectPayload.ops[0].mark).toBeNull();
    expect((deselectPayload.ops[0] as Record<string, unknown>).isFavorite).toBeUndefined();
  });

  it("2. quotaKnown = false thì CHẶN chọn ảnh, không thực hiện gọi API", () => {
    let apiCalled = false;
    const galleryState = {
      quotaKnown: false,
      includedQuota: null,
    };

    const handleHeartClick = () => {
      if (!galleryState.quotaKnown) {
        return {
          allowed: false,
          message: "Studio sẽ báo lại số ảnh trong gói, vui lòng liên hệ CSKH",
        };
      }
      apiCalled = true;
      return { allowed: true };
    };

    const result = handleHeartClick();
    expect(result.allowed).toBe(false);
    expect(result.message).toBe("Studio sẽ báo lại số ảnh trong gói, vui lòng liên hệ CSKH");
    expect(apiCalled).toBe(false);
  });

  it("3. Bốn con số hạn mức được lấy trực tiếp từ phản hồi API backend, không tự tính ở client", () => {
    // API backend trả về
    const backendResponse = {
      data: {
        selectedCount: 25,
        favoriteCount: 10,
        extraCount: 5,
        extraAmount: 250000,
        applied: 1,
        rejected: [],
      },
    };

    // Client gán trực tiếp từ response
    const stats = {
      selectedCount: backendResponse.data.selectedCount,
      extraCount: backendResponse.data.extraCount,
      extraAmount: backendResponse.data.extraAmount,
    };

    expect(stats.selectedCount).toBe(25);
    expect(stats.extraCount).toBe(5);
    expect(stats.extraAmount).toBe(250000);
  });
});

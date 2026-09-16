/**
 * BB-139 — cái chốt quyết định cơ sở dữ liệu nào được nhận tên thật.
 *
 * Phép thử này quan trọng hơn vẻ ngoài của nó: chốt sai một lần là 443 tên khách
 * và số điện thoại thật chảy vào một cơ sở dữ liệu mà bốn agent đều có khoá.
 */

import { describe, it, expect } from "vitest";
import { choPhepTenThat, maDuAn, MA_DU_AN_THAT } from "@/lib/lark/muc-tieu-du-lieu";

const BB_DEV = "ohkfoqqsrpvsponiwcij";
const BB_PROD = "hecpaiizklbuckqvdndk";

describe("BB-139: chốt tên thật", () => {
  it("Bóc được mã dự án từ cả chuỗi pooler lẫn địa chỉ API", () => {
    expect(maDuAn(`postgresql://postgres.${BB_DEV}:matkhau@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`)).toBe(BB_DEV);
    expect(maDuAn(`https://${BB_DEV}.supabase.co`)).toBe(BB_DEV);
    expect(maDuAn(`postgresql://postgres:matkhau@db.${BB_DEV}.supabase.co:5432/postgres`)).toBe(BB_DEV);
  });

  it("bb-prod ĐƯỢC nhận tên thật", () => {
    expect(choPhepTenThat(`postgresql://postgres.${BB_PROD}:x@aws-0.pooler.supabase.com:5432/postgres`)).toBe(true);
  });

  /**
   * Chủ studio chốt 16.09.2026: bb-dev hiện tên thật để soát dữ liệu trước khi
   * cắt sang bb-prod. Ca này canh ĐÚNG quyết định đó — đổi ý thì sửa cả hai chỗ,
   * đừng sửa một chỗ rồi để phép thử đỏ và tắt nó đi.
   */
  it("bb-dev ĐƯỢC nhận tên thật", () => {
    expect(choPhepTenThat(`postgresql://postgres.${BB_DEV}:x@aws-0.pooler.supabase.com:5432/postgres`)).toBe(true);
  });

  /** Danh sách cho phép phải ĐẾM ĐƯỢC. Dài thêm một dòng là một quyết định. */
  it("Chỉ đúng hai cơ sở dữ liệu được phép, không hơn", () => {
    expect([...MA_DU_AN_THAT].sort()).toEqual([BB_PROD, BB_DEV].sort());
  });

  /**
   * Ca quan trọng nhất. Bản đầu của agent viết "không phải bb-dev thì cho tên
   * thật" — dựng thêm bất kỳ cơ sở dữ liệu thử nào nữa là dữ liệu khách chảy vào
   * đó mà không ai làm gì sai.
   */
  it("Cơ sở dữ liệu LẠ thì che — chốt phải đóng sẵn, không mở sẵn", () => {
    expect(choPhepTenThat("postgresql://postgres.mottestnaodoxyz99:x@aws-0.pooler.supabase.com:5432/postgres")).toBe(false);
    expect(choPhepTenThat("postgresql://postgres:x@localhost:5432/postgres")).toBe(false);
    expect(choPhepTenThat("postgresql://postgres:x@127.0.0.1:5432/postgres")).toBe(false);
    expect(choPhepTenThat("")).toBe(false);
    expect(choPhepTenThat(undefined)).toBe(false);
    expect(choPhepTenThat(null)).toBe(false);
  });
});

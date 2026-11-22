import { describe, expect, it } from "vitest";
import { errMsg } from "./app";

describe("error messages", () => {
  it("translates password_too_weak", () => {
    const e = Object.assign(new Error("password_too_weak"), { code: "P0001" });
    expect(errMsg(e, "en")).toBe("Password must be at least 8 characters with uppercase and a digit");
    expect(errMsg(e, "ar")).toBe("كلمة المرور يجب أن تتكون من 8 أحرف على الأقل مع حرف كبير ورقم.");
  });

  it("translates invalid_email", () => {
    const e = Object.assign(new Error("invalid_email"), { code: "P0001" });
    expect(errMsg(e, "en")).toBe("Invalid email format.");
    expect(errMsg(e, "ar")).toBe("صيغة البريد الإلكتروني غير صحيحة.");
  });

  it("translates account_locked", () => {
    const e = Object.assign(new Error("account_locked"), { code: "P0001" });
    expect(errMsg(e, "en")).toBe("Account is locked. Try again later.");
    expect(errMsg(e, "ar")).toBe("الحساب مقفول. حاول مرة أخرى لاحقاً.");
  });

  it("translates invalid_credentials", () => {
    const e = Object.assign(new Error("invalid_credentials"), { code: "P0001" });
    expect(errMsg(e, "en")).toBe("Invalid email or password");
    expect(errMsg(e, "ar")).toBe("اسم المستخدم أو كلمة المرور غير صحيحة");
  });

  it("translates user_exists", () => {
    const e = Object.assign(new Error("user_exists"), { code: "P0001" });
    expect(errMsg(e, "en")).toBe("User already exists.");
    expect(errMsg(e, "ar")).toBe("المستخدم موجود مسبقاً.");
  });

  it("returns raw message when no translation matches", () => {
    const e = Object.assign(new Error("some_new_error"), { code: "P0001" });
    expect(errMsg(e, "en")).toBe("some_new_error");
  });

  it("handles non-Error objects (Supabase-style errors)", () => {
    const supaErr = { message: "password_too_weak", code: "P0001", details: null, hint: null };
    expect(errMsg(supaErr, "en")).toBe("Password must be at least 8 characters with uppercase and a digit");
  });
});

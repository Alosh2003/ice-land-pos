import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "./i18n";

export type Role = Database["public"]["Enums"]["app_role"];
export type Settings = Database["public"]["Tables"]["settings"]["Row"];
export type PayMethod = { code: string; ar: string; en: string; active: boolean };

export type Me = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
};

export const meQuery = queryOptions({
  queryKey: ["me"],
  staleTime: 30_000, // 30s
  queryFn: async () => {
    const { data, error } = await supabase.rpc("whoami");
    if (error) throw error;
    if (!data) return null;
    const m = data as unknown as Me;
    return { user: m, roles: [m.role as Role], profile: m };
  },
});

export function useMe() {
  const q = useQuery(meQuery);
  const roles = q.data?.roles ?? [];
  const has = (...r: Role[]) => roles.some((x) => r.includes(x));
  return { ...q, roles, has };
}

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  staleTime: 5 * 60_000, // 5 min — settings change rarely
  queryFn: async () => {
    const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data;
  },
});

export function useSettings() {
  return useQuery(settingsQuery).data;
}

export function useFmt() {
  const { lang } = useI18n();
  const s = useSettings();
  const dec = s?.currency_decimals ?? 0;
  const sym = lang === "ar" ? (s?.currency_symbol_ar ?? "ريال") : (s?.currency_symbol_en ?? "Rial");
  const locale = lang === "ar" ? "ar-u-nu-latn" : "en-US";
  const num = (n: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n || 0);
  const money = (n: number) => `${num(Number(n))} ${sym}`;
  const fmtDate = (d: string | Date, withTime = true) => {
    const dt = new Date(d);
    const p = (x: number) => String(x).padStart(2, "0");
    const f = (s?.date_format ?? "dd/MM/yyyy")
      .replace("dd", p(dt.getDate())).replace("MM", p(dt.getMonth() + 1)).replace("yyyy", String(dt.getFullYear()));
    return withTime ? `${f} ${p(dt.getHours())}:${p(dt.getMinutes())}` : f;
  };
  const pmName = (code: string) => {
    const m = ((s?.payment_methods as PayMethod[] | undefined) ?? []).find((x) => x.code === code);
    return m ? (lang === "ar" ? m.ar : m.en) : code;
  };
  return { money, num, fmtDate, pmName, sym, lang };
}

export const ERR: Record<string, [string, string]> = {
  insufficient_payment: ["المبلغ المدفوع أقل من الإجمالي", "Payment is less than the total"],
  change_exceeds_cash: ["الباقي يجب أن يُعاد نقداً", "Change can only be returned from cash"],
  price_edit_not_allowed: ["لا تملك صلاحية تعديل السعر", "You can't edit prices"],
  insufficient_stock: ["المخزون غير كافٍ", "Not enough stock"],
  product_unavailable: ["منتج غير متاح", "A product is unavailable"],
  not_authorized: ["غير مصرح", "Not authorized"],
  reason_required: ["السبب مطلوب", "A reason is required"],
  already_reversed: ["تم عكس هذه الفاتورة مسبقاً", "This invoice was already reversed"],
  empty_cart: ["السلة فارغة", "Cart is empty"],
  invalid_discount: ["خصم غير صالح", "Invalid discount"],
  day_closed: ["تم إغلاق مخزون هذا الصنف لليوم", "This item's inventory is closed for today"],
  opening_already_recorded: ["تم تسجيل كمية البداية مسبقاً", "Opening stock has already been recorded"],
  delivery_disabled: ["التوصيل غير مفعل", "Delivery is not enabled"],
  delivery_details_required: ["الهاتف وعنوان التوصيل مطلوبان", "Delivery phone and address are required"],
  invalid_payment_method: ["طريقة الدفع غير متاحة", "Payment method is unavailable"],
  invalid_credentials: ["اسم المستخدم أو كلمة المرور غير صحيحة", "Invalid email or password"],
  account_locked: ["الحساب مقفول. حاول مرة أخرى لاحقاً.", "Account is locked. Try again later."],
  password_too_weak: ["كلمة المرور يجب أن تتكون من 8 أحرف على الأقل مع حرف كبير ورقم.", "Password must be at least 8 characters with uppercase and a digit"],
  invalid_email: ["صيغة البريد الإلكتروني غير صحيحة.", "Invalid email format."],
  user_exists: ["المستخدم موجود مسبقاً.", "User already exists."],
  wrong_password: ["كلمة المرور الحالية غير صحيحة.", "Current password is incorrect."],
  invalid_token: ["رابط إعادة التعيين غير صالح أو منتهي الصلاحية.", "Invalid or expired reset link."],
  password_empty: ["كلمة المرور فارغة", "Password cannot be empty"],
  password_too_short: ["كلمة المرور يجب أن تتكون من 8 أحرف على الأقل", "Password must be at least 8 characters long"],
  password_no_requirements: ["كلمة المرور يجب أن تتكون من حرف كبير ورقم ورمز", "Password must contain an uppercase letter, a digit, and a symbol"],
  password_no_uppercase: ["كلمة المرور يجب أن تحتوي على حرف كبير", "Password must contain an uppercase letter"],
  password_no_digit: ["كلمة المرور يجب أن تحتوي على رقم", "Password must contain a digit"],
};
export function errMsg(e: unknown, lang: "ar" | "en") {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  const k = Object.keys(ERR).find((k) => m.includes(k));
  const translated = k ? ERR[k] : undefined;
  return translated ? translated[lang === "ar" ? 0 : 1] : m;
}

export async function signedImage(path: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("product-images").createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? null;
}

/** Local authentication helpers (no Supabase Auth, no Google OAuth). */
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.rpc("authenticate_user", {
    p_email: email,
    p_password: password,
  });
  if (error) throw error;
  return data as unknown as Me;
}

export async function signOut() {
  const { error } = await supabase.rpc("sign_out");
  if (error) throw error;
}

export async function getCurrentUser(): Promise<Me | null> {
  const { data, error } = await supabase.rpc("whoami");
  if (error) return null;
  if (!data) return null;
  return data as unknown as Me;
}

// ---- New Security Functions ----

export async function requestPasswordReset(email: string) {
  const { data, error } = await supabase.rpc("request_password_reset", { p_email: email.trim() });
  if (error) throw error;
  return data as unknown as { token: string; email: string };
}

export async function resetPasswordWithToken(token: string, newPassword: string) {
  const { data, error } = await supabase.rpc("reset_password_with_token", { p_token: token, p_new_password: newPassword });
  if (error) throw error;
  return data as unknown as { success: boolean; email: string };
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const { data, error } = await supabase.rpc("change_password", { p_old_password: oldPassword, p_new_password: newPassword });
  if (error) throw error;
  return data as unknown as { success: boolean };
}

export async function listUsers() {
  const { data, error } = await supabase.rpc("list_users");
  if (error) throw error;
  return data as unknown as UserRow[];
}

export async function createUser(
  email: string, fullName: string, password: string, role: Role, active = true
) {
  const { data, error } = await supabase.rpc("create_user", {
    p_email: email, p_full_name: fullName, p_password: password, p_role: role, p_active: active,
  });
  if (error) throw error;
  return data as unknown as { id: string; email: string };
}

export async function updateUser(userId: string, patch: { full_name?: string; role?: Role; active?: boolean }) {
  const { data, error } = await supabase.rpc("update_user", {
    p_user_id: userId,
    p_full_name: patch.full_name ?? null,
    p_role: patch.role ?? null,
    p_active: patch.active ?? null,
    p_role_set: patch.role !== undefined,
  });
  if (error) throw error;
  return data as unknown as { id: string };
}

export async function resetUserPassword(userId: string): Promise<string> {
  const { data, error } = await supabase.rpc("reset_user_password", { p_user_id: userId });
  if (error) throw error;
  return data as unknown as string;
}

export async function spendLoyaltyPoints(customerId: string, amount: number, reason = "") {
  const { data, error } = await supabase.rpc("spend_loyalty_points", {
    p_customer_id: customerId, p_amount: amount, p_reason: reason,
  });
  if (error) throw error;
  return data as unknown as { loyalty_points: number; spent: number };
}

// ---- Types ----

export type UserRow = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

export type AuthResetToken = {
  token: string;
  email: string;
};

import { type Badges, EMPTY_BADGES } from "@/lib/domain/nav";

/**
 * حساب شارات البنود المتأخرة من الحالة الحية:
 * مهام متأخرة، تراخيص توشك تنتهي، مخزون تحت الحد…
 * يُملأ فعلياً في المرحلتين ٤–٥ عند توفّر بيانات المزرعة؛ البنية جاهزة الآن.
 */
export async function computeBadges(_userId: string): Promise<Badges> {
  return EMPTY_BADGES;
}

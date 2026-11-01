import { SystemSetting } from "@/models/SystemSetting";
import { DEFAULT_SETTINGS, type SettingKey } from "@/lib/constants";

type SettingValue<K extends SettingKey> = (typeof DEFAULT_SETTINGS)[K]["value"] extends number
  ? number
  : (typeof DEFAULT_SETTINGS)[K]["value"] extends string
    ? string
    : (typeof DEFAULT_SETTINGS)[K]["value"] extends readonly string[]
      ? string[]
      : unknown;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const doc = await SystemSetting.findOne({ key }).lean();
  return (doc?.value ?? DEFAULT_SETTINGS[key].value) as SettingValue<K>;
}

export async function getAllSettings() {
  const docs = await SystemSetting.find().lean();
  const map = new Map(docs.map((d) => [d.key, d]));
  return (Object.keys(DEFAULT_SETTINGS) as SettingKey[]).map((key) => ({
    key,
    value: map.get(key)?.value ?? DEFAULT_SETTINGS[key].value,
    description: DEFAULT_SETTINGS[key].description,
    updatedAt: map.get(key)?.updatedAt ?? null,
  }));
}

export async function getMembershipConfig() {
  const [price, points, hours] = await Promise.all([
    getSetting("membership.price"),
    getSetting("membership.points"),
    getSetting("membership.hours"),
  ]);
  return { price: Number(price), points: Number(points), hours: Number(hours), minutes: Number(hours) * 60 };
}


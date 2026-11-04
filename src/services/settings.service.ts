import { SystemSetting } from "../models/SystemSetting";
import { DEFAULT_SETTINGS, type SettingKey } from "../lib/constants";

type SettingValue<K extends SettingKey> = (typeof DEFAULT_SETTINGS)[K]["value"] extends number
  ? number
  : (typeof DEFAULT_SETTINGS)[K]["value"] extends string
    ? string
    : (typeof DEFAULT_SETTINGS)[K]["value"] extends readonly string[]
      ? string[]
      : unknown;

/**
 * Settings are read on almost every request (membership config, alert thresholds) but change
 * rarely, so all of them are loaded with a single query and kept in memory for a short TTL.
 * Writes through the settings API call `invalidateSettingsCache()` so changes apply immediately
 * on that instance; other instances pick them up within SETTINGS_TTL_MS.
 */
const SETTINGS_TTL_MS = 30_000;
type SettingsCache = { values: Map<string, unknown> | null; expiresAt: number; pending: Promise<Map<string, unknown>> | null };
const g = globalThis as unknown as { __settingsCache?: SettingsCache };
const settingsCache: SettingsCache = g.__settingsCache ?? { values: null, expiresAt: 0, pending: null };
g.__settingsCache = settingsCache;

async function loadSettings(): Promise<Map<string, unknown>> {
  if (settingsCache.values && settingsCache.expiresAt > Date.now()) return settingsCache.values;
  if (!settingsCache.pending) {
    settingsCache.pending = SystemSetting.find()
      .select("key value")
      .lean()
      .then((docs) => {
        const map = new Map<string, unknown>(docs.map((d) => [d.key, d.value]));
        settingsCache.values = map;
        settingsCache.expiresAt = Date.now() + SETTINGS_TTL_MS;
        return map;
      })
      .finally(() => {
        settingsCache.pending = null;
      });
  }
  return settingsCache.pending;
}

export function invalidateSettingsCache() {
  settingsCache.values = null;
  settingsCache.expiresAt = 0;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const values = await loadSettings();
  return (values.get(key) ?? DEFAULT_SETTINGS[key].value) as SettingValue<K>;
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


/** Durable, per-user habit data. It is stored on the toolkit's persistent
 * session adapter; all collections are reached through this user's indexes. */
export type ScheduleType = "daily" | "weekdays" | "weekly";
export type CheckStatus = "done" | "missed";

export interface Profile {
  timezone: string;
  preferredReminderTime: string;
  repeatUntilCheck: boolean;
  repeatMinutes: number;
  locale: string;
  recapTime: string;
  notificationsConsented: boolean;
}
export interface Habit {
  id: string;
  title: string;
  scheduleType: ScheduleType;
  weeklyDay?: number;
  reminderTime: string;
  repeatUntilCheck: boolean;
  active: boolean;
  createdAt: string;
  goalCount: number;
}
export interface CheckIn {
  habitId: string;
  localDate: string;
  status: CheckStatus;
  source: "tap" | "edit" | "reminder";
  timestamp: string;
}
export interface HabitData {
  profile: Profile;
  habitIds: string[];
  habits: Record<string, Habit>;
  checkinsByHabit: Record<string, CheckIn[]>;
  nextHabitNumber: number;
}
export interface HabitDraft {
  title?: string;
  scheduleType?: ScheduleType;
  weeklyDay?: number;
  reminderTime?: string;
  repeatUntilCheck?: boolean;
}

let clock: () => Date = () => new Date();
export const now = (): Date => clock();
export const setClock = (value?: () => Date): void => { clock = value ?? (() => new Date()); };

export function defaultData(locale = "en", timezone = "UTC"): HabitData {
  return {
    profile: { timezone, preferredReminderTime: "09:00", repeatUntilCheck: true, repeatMinutes: 60, locale, recapTime: "18:00", notificationsConsented: true },
    habitIds: [], habits: {}, checkinsByHabit: {}, nextHabitNumber: 1,
  };
}

export function validTime(input: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(input); }
export function validDate(input: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(input) && !Number.isNaN(Date.parse(`${input}T12:00:00Z`)); }
export function localDate(date: Date, timeZone: string): string {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const get = (type: string) => p.find((x) => x.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch { return localDate(date, "UTC"); }
}
export function weekday(date: Date, timeZone: string): number {
  try {
    const label = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
  } catch { return weekday(date, "UTC"); }
}
export function isDue(habit: Habit, date: Date, timeZone: string): boolean {
  if (habit.scheduleType === "daily") return true;
  const day = weekday(date, timeZone);
  return habit.scheduleType === "weekdays" ? day >= 1 && day <= 5 : day === habit.weeklyDay;
}
export function checkinFor(data: HabitData, habitId: string, date: string): CheckIn | undefined {
  return data.checkinsByHabit[habitId]?.find((item) => item.localDate === date);
}
export function upsertCheckin(data: HabitData, habitId: string, date: string, status: CheckStatus, source: CheckIn["source"]): boolean {
  const rows = data.checkinsByHabit[habitId] ?? (data.checkinsByHabit[habitId] = []);
  const existing = rows.find((item) => item.localDate === date);
  if (existing?.status === status) return false;
  const entry: CheckIn = { habitId, localDate: date, status, source, timestamp: now().toISOString() };
  if (existing) Object.assign(existing, entry); else rows.push(entry);
  return true;
}
export interface Metrics { currentStreak: number; longestStreak: number; completionRate: number; completed: number; scheduled: number; missedDates: string[]; }
export function metricsFor(data: HabitData, habit: Habit, until = now()): Metrics {
  const today = localDate(until, data.profile.timezone);
  const rows = data.checkinsByHabit[habit.id] ?? [];
  const done = new Set(rows.filter((x) => x.status === "done").map((x) => x.localDate));
  const dates: string[] = [];
  const start = new Date(`${localDate(new Date(habit.createdAt), data.profile.timezone)}T12:00:00Z`);
  const end = new Date(`${today}T12:00:00Z`);
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86400000)) {
    if (isDue(habit, cursor, data.profile.timezone)) dates.push(cursor.toISOString().slice(0, 10));
  }
  let longest = 0, running = 0;
  for (const date of dates) { running = done.has(date) ? running + 1 : 0; longest = Math.max(longest, running); }
  let current = 0;
  for (let i = dates.length - 1; i >= 0 && done.has(dates[i]); i--) current++;
  const completed = dates.filter((date) => done.has(date)).length;
  return { currentStreak: current, longestStreak: longest, completionRate: dates.length ? Math.round((completed / dates.length) * 100) : 0, completed, scheduled: dates.length, missedDates: dates.filter((date) => !done.has(date)) };
}
export function escapeText(value: string): string { return value.replace(/[<>]/g, ""); }

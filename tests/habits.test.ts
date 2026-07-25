import { describe, expect, it, afterEach } from "vitest";
import { defaultData, localDate, metricsFor, setClock, upsertCheckin } from "../src/habits.js";

describe("habit dates and metrics", () => {
  afterEach(() => setClock());

  it("keeps the local calendar date across the New York DST transition", () => {
    expect(localDate(new Date("2026-03-08T06:30:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(localDate(new Date("2026-03-08T07:30:00Z"), "America/New_York")).toBe("2026-03-08");
  });

  it("calculates a weekly recap from indexed check-ins", () => {
    setClock(() => new Date("2026-07-25T12:00:00Z"));
    const data = defaultData("en", "UTC");
    const habit = { id: "h1", title: "Read", scheduleType: "daily" as const, reminderTime: "09:00", repeatUntilCheck: true, active: true, createdAt: "2026-07-23T12:00:00Z", goalCount: 1 };
    data.habitIds.push(habit.id); data.habits[habit.id] = habit; data.checkinsByHabit[habit.id] = [];
    upsertCheckin(data, habit.id, "2026-07-23", "done", "tap");
    upsertCheckin(data, habit.id, "2026-07-24", "done", "tap");
    expect(metricsFor(data, habit)).toMatchObject({ completed: 2, scheduled: 3, currentStreak: 0, longestStreak: 2, completionRate: 67 });
  });
});

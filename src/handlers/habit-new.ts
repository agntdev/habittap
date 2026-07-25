import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";
import { checkinFor, defaultData, escapeText, isDue, localDate, metricsFor, now, type HabitData, type ScheduleType, upsertCheckin, validDate, validTime } from "../habits.js";

registerMainMenuItem({ label: "New habit", data: "habit:new", order: 10 });
registerMainMenuItem({ label: "My habits", data: "habit:list", order: 20 });
registerMainMenuItem({ label: "Weekly recap", data: "habit:recap", order: 30 });
registerMainMenuItem({ label: "Settings", data: "habit:settings", order: 40 });

const composer = new Composer<Ctx>();
const back = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);
const scheduleKeyboard = inlineKeyboard([
  [inlineButton("Daily", "habit:schedule:daily"), inlineButton("Weekdays", "habit:schedule:weekdays")],
  [inlineButton("Weekly", "habit:schedule:weekly")],
  [inlineButton("Cancel", "habit:cancel")],
]);
const weekKeyboard = inlineKeyboard([
  [inlineButton("Mon", "habit:day:1"), inlineButton("Tue", "habit:day:2"), inlineButton("Wed", "habit:day:3")],
  [inlineButton("Thu", "habit:day:4"), inlineButton("Fri", "habit:day:5"), inlineButton("Sat", "habit:day:6"), inlineButton("Sun", "habit:day:0")],
]);
const repeatKeyboard = inlineKeyboard([[inlineButton("Repeat reminders", "habit:repeat:yes"), inlineButton("One reminder", "habit:repeat:no")], [inlineButton("Cancel", "habit:cancel")]]);

function data(ctx: Ctx): HabitData {
  return (ctx.session.habitData ??= defaultData(ctx.from?.language_code ?? "en"));
}
function today(store: HabitData): string { return localDate(now(), store.profile.timezone); }
function habitLabel(store: HabitData, id: string): string { return escapeText(store.habits[id]?.title ?? "That habit"); }
function listText(store: HabitData): string {
  const active = store.habitIds.map((id) => store.habits[id]).filter((item) => item?.active);
  if (!active.length) return "No active habits yet — tap New habit to add one.";
  const date = today(store);
  return active.map((habit) => {
    const due = isDue(habit, now(), store.profile.timezone);
    const status = !due ? "Not scheduled today" : checkinFor(store, habit.id, date)?.status === "done" ? "Done today" : "Due today";
    return `${escapeText(habit.title)} — ${status}\nReminder: ${habit.reminderTime}`;
  }).join("\n\n");
}
function listKeyboard(store: HabitData) {
  const rows = store.habitIds.map((id) => store.habits[id]).filter(Boolean).map((habit) => [inlineButton(escapeText(habit.title).slice(0, 28), `habit:view:${habit.id}`)]);
  rows.push([inlineButton("New habit", "habit:new"), inlineButton("Back to menu", "menu:main")]);
  return inlineKeyboard(rows);
}
function viewText(store: HabitData, id: string): string {
  const habit = store.habits[id];
  if (!habit) return "That habit is no longer available.";
  const metric = metricsFor(store, habit);
  const schedule = habit.scheduleType === "weekly" ? `Weekly (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][habit.weeklyDay ?? 0]})` : habit.scheduleType === "weekdays" ? "Weekdays" : "Daily";
  return `${escapeText(habit.title)}\n${habit.active ? "Active" : "Paused"} · ${schedule} · ${habit.reminderTime}\nCurrent streak: ${metric.currentStreak} · Longest: ${metric.longestStreak}\nCompletion: ${metric.completionRate}%`;
}
function viewKeyboard(store: HabitData, id: string) {
  const habit = store.habits[id];
  if (!habit) return back;
  return inlineKeyboard([
    [inlineButton("Check in", `habit:done:${id}`), inlineButton(habit.active ? "Pause" : "Resume", `habit:toggle:${id}`)],
    [inlineButton("Edit schedule", `habit:editschedule:${id}`), inlineButton("Edit time", `habit:edittime:${id}`)],
    [inlineButton("Edit day", `habit:editday:${id}`), inlineButton("Delete", `habit:delete:${id}`)],
    [inlineButton("Back to habits", "habit:list")],
  ]);
}
async function edit(ctx: Ctx, text: string, markup = back) { await ctx.editMessageText(text, { reply_markup: markup }); }

composer.callbackQuery("habit:new", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.habitDraft = {};
  await edit(ctx, "What do you want to track? Send a short habit name.", inlineKeyboard([[inlineButton("Cancel", "habit:cancel")]]));
});
composer.callbackQuery("habit:cancel", async (ctx) => { await ctx.answerCallbackQuery(); delete ctx.session.habitDraft; delete ctx.session.habitEdit; await edit(ctx, "Nothing was changed.", back); });

composer.on("message:text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return next();
  const store = data(ctx);
  if (ctx.session.habitDraft && !ctx.session.habitDraft.title) {
    if (!text || text.length > 80) { await ctx.reply("Use a habit name up to 80 characters."); return; }
    ctx.session.habitDraft.title = text;
    await ctx.reply("Choose how often you want to do it.", { reply_markup: scheduleKeyboard });
    return;
  }
  if (ctx.session.habitDraft?.scheduleType && !ctx.session.habitDraft.reminderTime) {
    if (!validTime(text)) { await ctx.reply("Use a time like 09:00."); return; }
    ctx.session.habitDraft.reminderTime = text;
    await ctx.reply("Should reminders repeat every 60 minutes until you check in?", { reply_markup: repeatKeyboard });
    return;
  }
  if (ctx.session.habitEdit?.field === "time") {
    if (!validTime(text)) { await ctx.reply("Use a time like 09:00."); return; }
    const habit = store.habits[ctx.session.habitEdit.habitId];
    if (habit) habit.reminderTime = text;
    delete ctx.session.habitEdit;
    await ctx.reply(habit ? `Reminder time for ${habitLabel(store, habit.id)} is now ${text}.` : "That habit is no longer available.");
    return;
  }
  if (ctx.session.habitEdit?.field === "day") {
    if (!validDate(text)) { await ctx.reply("Use a date like 2026-07-25."); return; }
    const habit = store.habits[ctx.session.habitEdit.habitId];
    if (!habit) { delete ctx.session.habitEdit; await ctx.reply("That habit is no longer available."); return; }
    const age = Math.floor((now().getTime() - new Date(`${text}T12:00:00Z`).getTime()) / 86400000);
    if (age < 0 || age > 7) { await ctx.reply("You can edit a check-in from the last 7 days."); return; }
    (ctx.session.habitEdit as { habitId: string; field: "day"; date?: string }).date = text;
    await ctx.reply(`Set ${text} as done or missed.`, { reply_markup: inlineKeyboard([[inlineButton("Done", `habit:past:done:${habit.id}`), inlineButton("Missed", `habit:past:missed:${habit.id}`)]] ) });
    return;
  }
  return next();
});

composer.on("callback_query:data", async (ctx, next) => {
  const value = ctx.callbackQuery.data;
  if (!value.startsWith("habit:")) return next();
  const store = data(ctx);
  const parts = value.split(":");
  if (parts[1] === "schedule") {
    await ctx.answerCallbackQuery();
    const type = parts[2] as ScheduleType;
    if (ctx.session.habitEdit) {
      const habit = store.habits[ctx.session.habitEdit.habitId];
      if (!habit) { await edit(ctx, "That habit is no longer available.", back); return; }
      habit.scheduleType = type;
      if (type === "weekly") { await edit(ctx, "Choose the new day for this habit.", weekKeyboard); return; }
      await edit(ctx, "Send a new reminder time, for example 09:00.", inlineKeyboard([[inlineButton("Cancel", "habit:cancel")]]));
      return;
    }
    if (!ctx.session.habitDraft?.title || !["daily", "weekdays", "weekly"].includes(type)) { await edit(ctx, "Start a new habit first.", back); return; }
    ctx.session.habitDraft.scheduleType = type;
    if (type === "weekly") { await edit(ctx, "Choose the day for this habit.", weekKeyboard); return; }
    await edit(ctx, "Send the reminder time, for example 09:00.", inlineKeyboard([[inlineButton("Cancel", "habit:cancel")]]));
    return;
  }
  if (parts[1] === "day") {
    await ctx.answerCallbackQuery();
    if (ctx.session.habitEdit) {
      const habit = store.habits[ctx.session.habitEdit.habitId];
      if (!habit) { await edit(ctx, "That habit is no longer available.", back); return; }
      habit.scheduleType = "weekly"; habit.weeklyDay = Number(parts[2]);
      await edit(ctx, "Send a new reminder time, for example 09:00.", inlineKeyboard([[inlineButton("Cancel", "habit:cancel")]]));
      return;
    }
    if (!ctx.session.habitDraft?.title) { await edit(ctx, "Start a new habit first.", back); return; }
    ctx.session.habitDraft.scheduleType = "weekly"; ctx.session.habitDraft.weeklyDay = Number(parts[2]);
    await edit(ctx, "Send the reminder time, for example 09:00.", inlineKeyboard([[inlineButton("Cancel", "habit:cancel")]]));
    return;
  }
  if (parts[1] === "repeat") {
    await ctx.answerCallbackQuery();
    const draft = ctx.session.habitDraft;
    if (!draft?.title || !draft.scheduleType || !draft.reminderTime) { await edit(ctx, "Start a new habit first.", back); return; }
    const id = `h${store.nextHabitNumber++}`;
    store.habits[id] = { id, title: draft.title, scheduleType: draft.scheduleType, weeklyDay: draft.weeklyDay, reminderTime: draft.reminderTime, repeatUntilCheck: parts[2] === "yes", active: true, createdAt: now().toISOString(), goalCount: 1 };
    store.habitIds.push(id); store.checkinsByHabit[id] = []; delete ctx.session.habitDraft;
    await edit(ctx, `${habitLabel(store, id)} is ready. Reminder: ${store.habits[id].reminderTime}.`, viewKeyboard(store, id));
    return;
  }
  if (parts[1] === "list") { await ctx.answerCallbackQuery(); await edit(ctx, listText(store), listKeyboard(store)); return; }
  if (parts[1] === "view") { await ctx.answerCallbackQuery(); await edit(ctx, viewText(store, parts[2]), viewKeyboard(store, parts[2])); return; }
  if (parts[1] === "done") {
    await ctx.answerCallbackQuery(); const id = parts[2], habit = store.habits[id];
    if (!habit) { await edit(ctx, "That habit is no longer available.", back); return; }
    const date = today(store);
    if (!isDue(habit, now(), store.profile.timezone)) { await edit(ctx, `${habitLabel(store, id)} isn't scheduled today.`, viewKeyboard(store, id)); return; }
    if (!upsertCheckin(store, id, date, "done", "tap")) { await edit(ctx, `${habitLabel(store, id)} is already checked in for today.`, viewKeyboard(store, id)); return; }
    const metric = metricsFor(store, habit); await edit(ctx, `${habitLabel(store, id)} checked in. Current streak: ${metric.currentStreak}.`, viewKeyboard(store, id)); return;
  }
  if (parts[1] === "toggle") { await ctx.answerCallbackQuery(); const habit = store.habits[parts[2]]; if (!habit) { await edit(ctx, "That habit is no longer available.", back); return; } habit.active = !habit.active; await edit(ctx, `${habitLabel(store, habit.id)} is ${habit.active ? "active" : "paused"}.`, viewKeyboard(store, habit.id)); return; }
  if (parts[1] === "delete") { await ctx.answerCallbackQuery(); const id = parts[2]; if (!store.habits[id]) { await edit(ctx, "That habit is no longer available.", back); return; } await edit(ctx, `Delete ${habitLabel(store, id)}?`, inlineKeyboard([[inlineButton("Delete", `habit:confirmdelete:${id}`), inlineButton("Keep habit", `habit:view:${id}`)]])); return; }
  if (parts[1] === "confirmdelete") { await ctx.answerCallbackQuery(); const id = parts[2]; delete store.habits[id]; delete store.checkinsByHabit[id]; store.habitIds = store.habitIds.filter((item) => item !== id); await edit(ctx, "Habit deleted.", inlineKeyboard([[inlineButton("Back to habits", "habit:list")]])); return; }
  if (parts[1] === "editschedule") { await ctx.answerCallbackQuery(); ctx.session.habitEdit = { habitId: parts[2], field: "time" }; delete ctx.session.habitDraft; await edit(ctx, "Choose a new schedule.", scheduleKeyboard); return; }
  if (parts[1] === "edittime") { await ctx.answerCallbackQuery(); ctx.session.habitEdit = { habitId: parts[2], field: "time" }; await edit(ctx, "Send a new reminder time, for example 09:00.", inlineKeyboard([[inlineButton("Cancel", "habit:cancel")]])); return; }
  if (parts[1] === "editday") { await ctx.answerCallbackQuery(); ctx.session.habitEdit = { habitId: parts[2], field: "day" }; await edit(ctx, "Send a date from the last 7 days, for example 2026-07-25.", inlineKeyboard([[inlineButton("Cancel", "habit:cancel")]])); return; }
  if (parts[1] === "past") { await ctx.answerCallbackQuery(); const id = parts[3], state = ctx.session.habitEdit as { habitId: string; field: "day"; date?: string } | undefined; if (!state?.date || state.habitId !== id || !store.habits[id]) { await edit(ctx, "Choose a date to edit first.", back); return; } upsertCheckin(store, id, state.date, parts[2] === "done" ? "done" : "missed", "edit"); delete ctx.session.habitEdit; await edit(ctx, `${state.date} was updated for ${habitLabel(store, id)}.`, viewKeyboard(store, id)); return; }
  if (parts[1] === "recap") { await ctx.answerCallbackQuery(); const active = store.habitIds.map((id) => store.habits[id]).filter((item) => item?.active); if (!active.length) { await edit(ctx, "No active habits yet — tap New habit to add one.", back); return; } const lines = active.map((habit) => { const m = metricsFor(store, habit); return `${escapeText(habit.title)}: ${m.completed}/${m.scheduled} completed, streak ${m.currentStreak}, missed ${m.missedDates.slice(-7).join(", ") || "none"}.`; }); await edit(ctx, `Weekly recap\n${lines.join("\n")}`, inlineKeyboard([[inlineButton("Back to habits", "habit:list")]])); return; }
  if (parts[1] === "settings") { await ctx.answerCallbackQuery(); await edit(ctx, `Timezone: ${store.profile.timezone}\nDefault reminder: ${store.profile.preferredReminderTime}\nRepeats every ${store.profile.repeatMinutes} minutes.`, inlineKeyboard([[inlineButton("Use UTC", "habit:tz:UTC"), inlineButton("Use New York", "habit:tz:America/New_York")], [inlineButton("Use London", "habit:tz:Europe/London"), inlineButton("Back to menu", "menu:main")]])); return; }
  if (parts[1] === "tz") { await ctx.answerCallbackQuery(); const zone = parts.slice(2).join(":"); try { new Intl.DateTimeFormat("en", { timeZone: zone }); store.profile.timezone = zone; await edit(ctx, `Timezone set to ${zone}.`, back); } catch { await edit(ctx, "That timezone isn't available. Try another one.", back); } return; }
  await next();
});

export function habitListMessage(store: HabitData): string { return listText(store); }
export default composer;

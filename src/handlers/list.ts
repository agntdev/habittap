import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { defaultData, isDue, localDate, now, checkinFor, escapeText } from "../habits.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
composer.command("list", async (ctx) => {
  const store = (ctx.session.habitData ??= defaultData(ctx.from?.language_code ?? "en"));
  const date = localDate(now(), store.profile.timezone);
  const habits = store.habitIds.map((id) => store.habits[id]).filter((habit) => habit?.active);
  const text = habits.length ? habits.map((habit) => `${escapeText(habit.title)} — ${isDue(habit, now(), store.profile.timezone) ? checkinFor(store, habit.id, date)?.status === "done" ? "Done today" : `Due today · ${habit.reminderTime}` : "Not scheduled today"}`).join("\n") : "No active habits yet — tap New habit to add one.";
  await ctx.reply(text, { reply_markup: inlineKeyboard([[inlineButton("My habits", "habit:list"), inlineButton("New habit", "habit:new")]]) });
});
export default composer;

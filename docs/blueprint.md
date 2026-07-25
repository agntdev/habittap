# Private Habit Tracker — Bot specification

**Archetype:** custom

**Voice:** neutral and concise — write every user-facing message, button label, error, and empty state in this voice.

A private Telegram bot for tracking habits with flexible schedules, reminders, and weekly recaps. Users can create habits with daily/weekday/weekly schedules, receive localized reminders, log check-ins, and view streaks and metrics—all with neutral, non-cheesy feedback.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individuals
- habit trackers
- productivity users

## Success criteria

- Users can create and track habits with custom schedules
- Users receive reminders at chosen local times
- Single-tap check-ins with status tracking
- Weekly recaps with metrics and streaks
- Private data storage with no third-party sharing

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu or onboarding flow for new users
  - inputs: user timezone, default reminder preferences
  - outputs: main menu, habit list
- **New Habit** (button, actor: user, callback: habit:new) — Start creating a new habit with schedule configuration
  - inputs: habit title, schedule type, reminder time
  - outputs: confirmation message
- **/list** (command, actor: user, command: /list) — Show all active habits with today's status and next reminder
  - inputs: none
  - outputs: habit summary list

## Flows

### Onboarding
_Trigger:_ /start

1. Detect device timezone
2. Set default reminder style (repeat-until-check enabled)
3. Set default 60-minute repeat interval

_Data touched:_ user profile

### Habit Creation
_Trigger:_ habit:new

1. Enter title
2. Choose schedule type (daily/weekdays/weekly)
3. Set reminder time
4. Configure repeat-until-check

_Data touched:_ habit, user profile

### Daily Reminder
_Trigger:_ scheduled event

1. Send localized notification with Done button
2. Resend every 60 minutes if repeat-until-check enabled
3. Log check-in on tap

_Data touched:_ check-in, metrics

### Weekly Recap
_Trigger:_ scheduled event

1. Generate summary of completion rates, streaks, and missed dates
2. Send recap at user-chosen time

_Data touched:_ metrics, check-in history

### Manual Edits
_Trigger:_ user command

1. Pause/resume habit
2. Edit schedule/time
3. Delete habit
4. Edit single past check-in

_Data touched:_ habit, check-in

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User Profile** _(retention: persistent)_ — User preferences and metadata
  - fields: timezone, preferred_reminder_time, notification_preferences, locale
- **Habit** _(retention: persistent)_ — User-created habit configuration
  - fields: title, schedule_type, reminder_time, repeat_until_check, active_status, created_at, goal_count
- **Check-in** — Daily habit status logs
  - fields: habit_id, user_id, local_date, status, source, timestamp
- **Metrics** _(retention: persistent)_ — Streak and completion statistics
  - fields: current_streak, longest_streak, completion_rate

## Integrations

- **Telegram** (required) — Bot API messaging and notifications
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Pause/resume habits
- Edit habit schedules/times
- Delete habits
- Edit single past check-in via 'Edit day' flow

## Notifications

- Daily reminders with quick-action buttons
- Weekly recap summaries
- Check-in confirmation messages

## Permissions & privacy

- All data is private per user
- No third-party sharing or social features
- User consent required for notifications

## Edge cases

- Duplicate check-in taps for same habit/date
- Timezone changes mid-day
- Missed reminders due to clock drift
- Editing past check-ins within correction window

## Required tests

- End-to-end habit creation → reminder → check-in → metrics flow
- Timezone handling across DST transitions
- Weekly recap generation with sample data
- Duplicate check-in prevention

## Assumptions

- Users have stable internet access for notifications
- Device/Telegram-provided timezone is accurate
- Users will manually edit habits for complex schedule changes

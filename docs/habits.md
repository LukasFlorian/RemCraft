# Habits (beta)

A habit tracker inside RemCraft (sidebar → **Gewohnheiten**, only in the beta app until the
feature is promoted, see [development.md](development.md#beta-channel)).

## Features

| Feature         | How it works                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Habits          | Name, description, icon (≈ 100), colour (30), start day; archive or delete; drag to reorder.                                                                                                     |
| Build or quit   | _Aufbauen_: tick the days you do it. _Abgewöhnen_: every day counts until you record a slip.                                                                                                     |
| Recording       | _Ja/Nein_ (tap), _Zähler_ (tap counts up to the daily target, − counts down), _Messwert_ (value with unit, e.g. 20 Seiten), _Karteikarten_ (done automatically when you review that many cards). |
| Goals           | Daily, *n*× per week or *n*× per month. Streaks count in goal periods; a missed day is fine if the week still adds up.                                                                           |
| Overview        | Three layouts: cards with a tile grid (today in the right-most column), checklist (last five days, tap any), compact (current week).                                                             |
| Detail          | Year grid (tap a tile to fill in a day), streak and goal chips, totals, completion rate, current/best streak, completions per month, month calendar (hold a day for a note), notes list.         |
| Statistics      | All habits (rate, streaks, completions per year, monthly chart) or one habit; CSV export.                                                                                                        |
| Share card      | PNG of the grid with name and numbers; dark, light or in the habit colour; 3/6/12 months; system share sheet or download.                                                                        |
| Reminders       | Several per habit (weekdays + time). Local notifications while the app is open or alive in the background; only when the habit is not done yet. No push server: a closed app cannot remind.      |
| Sync and backup | Synced like everything else (`habits`, `habitEntries`), included in the JSON backup.                                                                                                             |

Not possible in a web app: home-screen widgets. The sidebar shows how many habits are still open
today.

## Data

- `Habit` (`src/core/model/types.ts`): kind, tracking, target, unit, goal, reminders, start day.
- `HabitEntry`: one record per habit and day, id `<habit>:<YYYY-MM-DD>`, value and optional note.
  Days edited on different devices never conflict.
- Logic: `src/core/habits/` (days and periods, done days, streaks, rate, totals, reminders).
- Service: `src/data/services/habits.ts`; UI: `src/ui/habits/`.

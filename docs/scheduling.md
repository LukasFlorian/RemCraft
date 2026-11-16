# Scheduling

This document describes how RemCraft decides _when_ a card is shown. Everything lives in
`src/core/scheduling/` and is covered by unit tests.

## Ratings

| Key | RemNote label        | Meaning                                           |
| --- | -------------------- | ------------------------------------------------- |
| 1   | Forgot               | could not remember                                |
| 2   | Partially recalled   | hard, missing details, unsure                     |
| 3   | Recalled with effort | correct with effort                               |
| 4   | Easily recalled      | instant                                           |
| S   | Skip                 | no rating; a reviewed card comes back in one hour |

## Anki SM-2 (RemNote variant) – the default

Research basis: RemNote's help article _"The Anki SM-2 Spaced Repetition Algorithm"_
(starting ease 230 %, easy bonus 1.3, hard factor 1.2, ease ±15 pp, lapse multiplier 0.1,
late bonus divided by a "hardness divider") and Anki's documented defaults for the rest.

**Learning phase** – new cards walk through `learningSteps` (default 1 min, 10 min):

| Rating      | Effect                                                                  |
| ----------- | ----------------------------------------------------------------------- |
| Forgot      | back to step 1                                                          |
| Partially   | repeat the step (first step: average of steps 1 and 2)                  |
| With effort | next step; after the last step graduate with `graduatingInterval` (1 d) |
| Easily      | graduate immediately with `easyInterval` (4 d)                          |

**Exponential phase** (`I` = current interval, `E` = ease, `late` = days overdue):

| Rating      | New interval                                        | Ease   |
| ----------- | --------------------------------------------------- | ------ |
| Partially   | `max((I + late/4) × 1.2, I + 1)`                    | −15 pp |
| With effort | `max((I + late/2) × E, hard + 1)`                   | ±0     |
| Easily      | `max((I + late) × E × 1.3, good + 1)`               | +15 pp |
| Forgot      | lapse: `max(1, I × 0.1)`, relearning steps (10 min) | −20 pp |

Intervals are multiplied by the interval modifier, capped by the maximum interval, rounded to
days and fuzzed (±15 % → ±5 %, like Anki/FSRS) so cards learned together spread out. The ease
never drops below 130 %. All values are configurable in _Settings → Schedulers_.

## FSRS-6

FSRS models each card with _stability_ `S` (days until recall probability drops to 90 %) and
_difficulty_ `D` (1–10), using 21 weights `w0…w20` (defaults of FSRS-6):

- Forgetting curve: `R(t, S) = (1 + f·t/S)^(−w20)` with `f = 0.9^(−1/w20) − 1`
- Interval for desired retention `r`: `I = S/f · (r^(−1/w20) − 1)`
- Initial values: `S0(G) = w[G−1]`, `D0(G) = w4 − e^{w5(G−1)} + 1`
- Difficulty: linear damping `ΔD·(10−D)/9` with `ΔD = −w6(G−3)`, mean reversion towards `D0(4)` with `w7`
- Recall: `S' = S·(1 + e^{w8}(11−D)S^{−w9}(e^{w10(1−R)} − 1)·hardPenalty·easyBonus)`
- Lapse: `S' = min(S/e^{w17·w18}, w11·D^{−w12}((S+1)^{w13} − 1)e^{w14(1−R)})`
- Same-day reviews: `S' = S·e^{w17(G−3+w18)}·S^{−w19}` (never below `S` for G ≥ 2)

The implementation (`fsrs.ts`) is cross-checked against the reference implementation
`ts-fsrs` for a grid of inputs (relative error < 1e-7). Learning/relearning steps work as in
SM-2; review intervals are forced to be strictly ordered (Hard < Good < Easy). The desired
retention (default 90 %) is a slider in the scheduler settings. Optimising weights is not built
in yet - optimised weights can be pasted, and every review is logged with the full previous
state so an optimiser can be added later.

## Custom schedulers and inheritance

Besides the global default (_Settings → Schedulers_), any number of SM-2 or FSRS
configurations can be created and assigned to a document or folder (⋯ menu → Scheduler).
The closest assignment up the tree wins - exactly like RemNote's custom schedulers.

## Priorities and the daily queue

Priorities are set per document/folder and inherited: **Currently Studying** (active),
**Maintaining**, **No Priority** (default) and **Paused**; **Exam** is derived from exams and
beats all but _Paused_. The daily queue (`queue.ts`) is ordered:

1. (Re)learning cards due within 20 minutes (any priority)
2. Exam cards: due reviews → today's new-card quota → today's final-review quota
3. Currently Studying: due reviews → new cards (limit _new cards per day_)
4. Maintaining: due reviews
5. No Priority: due reviews → new cards (same daily limit)

Paused cards never appear in the global queue, but can be practiced explicitly from their
document. Within a bucket, reviews are ordered by retrievability (most at risk first) unless
_shuffle_ is enabled. Practicing a document offers _spaced repetition_, _practice all_,
_all in order_ and _cram_ (no scheduling effect).

## Daily goal and streak

- Goal modes: _all due cards_ (default), _Exams + Currently Studying_ (RemNote's recommended
  setting) or a fixed number.
- Progress counts correct answers today (_Forgot_ does not count), like RemNote 1.27.
- Streak: consecutive study days with at least _streak goal_ reviews (default 10). A study day
  starts at the configured hour (default 04:00).

## Exam scheduler

Modelled after RemNote's Exam Scheduler V2 (`exam.ts`). An exam has a date/time, a scope
(documents/folders) and options.

**Windows**: the _final review_ covers the last `finalReviewDays` days before the exam day
(default 2); everything before is the _learning period_.

**New cards** (never practiced):

- _Spread_ (default): today's quota is `ceil((remaining + introducedToday) / learningDaysLeft) −
introducedToday`. The quota is recomputed every day from what is left, so missed days are
  automatically redistributed (catch-up) and the quota does not shrink while you learn.
- _Due now_: all new cards are queued immediately.
- If no learning days are left, all remaining new cards are due.

**Extra practice** (default on): a card leaving (re)learning must have been recalled at least
twice in a row (`streak ≥ 2`); otherwise it comes back after 10 minutes. This applies to new
cards ("repeated until recalled twice") and to cards missed during the exam period.

**Regular reviews** follow the card's scheduler. If the final review is disabled, a review that
would fall after the exam is pulled to the day before it.

**Final review**: every started card whose last review happened before the final window gets
one more review; the pending cards are spread evenly over the remaining final-review days,
weakest first.

**Daily target** = new quota + due reviews + final-review quota + correct answers already given
today. The exam is _on track_ while there is no overdue backlog from previous days.

**Study plan**: `planExam` projects every remaining day until the exam - new cards per the quota
rule, future reviews by simulating "Recalled with effort" answers with the card's scheduler, and
final reviews - shown as a stacked bar chart and a month calendar. After the exam date the exam
no longer influences priorities; cards continue with their regular schedule.

## Sources

- RemNote Help Center: _The Anki SM-2 Spaced Repetition Algorithm_, _The FSRS Spaced Repetition
  Algorithm_, _Custom Schedulers_, _Understanding the Exam Scheduler_, _Preparing for an Exam_,
  _Setting Priorities and Disabling Flashcards_, _The Daily Learning Goal_, _Flashcard Basics_.
- RemNote changelogs 1.15 (Exam Scheduler) and 1.27 (Exam Scheduler V2).
- open-spaced-repetition: FSRS-6 algorithm and `ts-fsrs` reference implementation.
- Anki manual: deck options (learning steps, ease, fuzz).

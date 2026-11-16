# 0007 Daily study plans computed in the client

**Status**: accepted

## Context

Todoist tasks must be created at 00:01 local time, also when no device is open. The scheduler,
exam planner and card derivation live in the TypeScript core in the browser.

## Decision

The browser computes a 14-day forecast with the real queue and uploads it (`daily_plans`).
A small Edge Function, triggered hourly, only reads the plan of the day and talks to Todoist.

## Consequences

- No second scheduler implementation or bundling of the core into Deno.
- Plans for later days assume no practice in between; they are refreshed after every change.
- If the app is not opened for more than 14 days, no plan exists and nothing is sent.

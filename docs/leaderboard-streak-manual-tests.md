# Leaderboard + Streak Manual Test Notes

## Scenarios to verify

1. New user with no attempts
- Open the dashboard and leaderboard page after signing in as a brand-new account.
- Confirm current streak and best streak show `0`.
- Confirm the leaderboard preview and full leaderboard show a friendly empty state or no personal row.

2. One user with multiple same-day quizzes
- Complete multiple quizzes on the same calendar day.
- Confirm the current streak increases by only 1 day for that date.
- Confirm the best streak does not double-count same-day attempts.

3. Multiple users with different scores
- Complete quizzes for several users with different scores and completion counts.
- Confirm the overall leaderboard sorts by average percentage descending, then completed count descending.
- Confirm the current user row is highlighted when present in the visible leaderboard results.

4. Streak reset after skipped day
- Complete a quiz on day 1 and day 2.
- Skip day 3 and complete another quiz on day 4.
- Confirm current streak resets after the skipped day and starts again from the new run.
- Confirm best streak still reflects the best historical run.

5. Leaderboard rank correctness
- Verify rank order is stable for tied scores using the documented tie-breakers.
- Overall: average score, then completed attempts.
- Streak: current streak, then best streak.
- Topic: average score, then completed attempts.

## Quick checks

- Dashboard shows Current Streak, Best Streak, User Rank, and a top 5 leaderboard preview.
- `/leaderboard.html` loads Overall, Streak, and By Topic tabs.
- No email, password, or other private fields appear in leaderboard responses.

const assert = require('assert');
const core = require('../src/core-engine.js');

console.log('=== Running HabitFlow A55 Core Engine Automated Test Suite ===');

// 1. Saturday-First Weekday Convention Tests
// 2026-10-15 is a Thursday -> satIdx should be 5 (0=Sat, 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri)
assert.strictEqual(core.getSatDayIndex('2026-10-10'), 0, '2026-10-10 must be Saturday (0)');
assert.strictEqual(core.getSatDayIndex('2026-10-11'), 1, '2026-10-11 must be Sunday (1)');
assert.strictEqual(core.getSatDayIndex('2026-10-12'), 2, '2026-10-12 must be Monday (2)');
assert.strictEqual(core.getSatDayIndex('2026-10-13'), 3, '2026-10-13 must be Tuesday (3)');
assert.strictEqual(core.getSatDayIndex('2026-10-14'), 4, '2026-10-14 must be Wednesday (4)');
assert.strictEqual(core.getSatDayIndex('2026-10-15'), 5, '2026-10-15 must be Thursday (5)');
assert.strictEqual(core.getSatDayIndex('2026-10-16'), 6, '2026-10-16 must be Friday (6)');

assert.strictEqual(core.getWeekStartSaturday('2026-10-15'), '2026-10-10', 'Week start of Thu Oct 15 must be Sat Oct 10');
assert.strictEqual(core.getWeekEndFriday('2026-10-15'), '2026-10-16', 'Week end of Thu Oct 15 must be Fri Oct 16');
console.log('[PASS] 1. Saturday-to-Friday weekday convention & week bounds verified.');

// 2. Leap Year & Date Boundary Validation
assert.strictEqual(core.isValidDateStr('2024-02-29'), true, '2024 is a leap year');
assert.strictEqual(core.isValidDateStr('2026-02-29'), false, '2026 is not a leap year');
assert.strictEqual(core.addDays('2024-02-28', 1), '2024-02-29', 'Leap day transition');
assert.strictEqual(core.addDays('2024-02-29', 1), '2024-03-01', 'Day after leap day');
assert.strictEqual(core.addDays('2026-12-31', 1), '2027-01-01', 'Year boundary transition');

const oct2026Grid = core.getMonthlyCalendarGrid(2026, 10);
assert.strictEqual(oct2026Grid.weeks[0][0].satIdx, 0, 'First cell of monthly grid must be Saturday');
assert.strictEqual(oct2026Grid.weeks[oct2026Grid.weeks.length - 1][6].satIdx, 6, 'Last cell of monthly grid must be Friday');
console.log('[PASS] 2. Leap years, year boundaries, and monthly Saturday-first grid verified.');

// 3. Fixed Weekday Schedule Streak Test (Sat=0, Mon=2, Wed=4)
const fixedHabit = {
  id: 'h_fixed',
  name: 'Gym Workout',
  frequencyType: 'weekdays',
  scheduledDays: [0, 2, 4], // Sat, Mon, Wed
  startDate: '2026-10-03', // Saturday Oct 3
  status: 'active'
};
const compMap = new Map();
// Complete Sat Oct 3, Mon Oct 5, Wed Oct 7, Sat Oct 10, Mon Oct 12, Wed Oct 14
['2026-10-03', '2026-10-05', '2026-10-07', '2026-10-10', '2026-10-12', '2026-10-14'].forEach(d => {
  compMap.set(`h_fixed_${d}`, { id: `h_fixed_${d}`, habitId: 'h_fixed', date: d, completed: true });
});
// Evaluate on Thursday Oct 15 (unscheduled day) -> streak should be 6!
const fixedStreakThu = core.calculateHabitStreaks(fixedHabit, compMap, '2026-10-15');
assert.strictEqual(fixedStreakThu.currentStreak, 6, 'Unscheduled days (Sun, Tue, Thu, Fri) must not break fixed weekday streak');
assert.strictEqual(fixedStreakThu.longestStreak, 6, 'Longest streak should be 6');

// Evaluate on Saturday Oct 17 BEFORE completing today -> grace period keeps streak at 6
const fixedStreakSatMorning = core.calculateHabitStreaks(fixedHabit, compMap, '2026-10-17');
assert.strictEqual(fixedStreakSatMorning.currentStreak, 6, 'Today grace period must preserve current streak before today is completed');

// Complete Saturday Oct 17 -> streak immediately becomes 7
compMap.set('h_fixed_2026-10-17', { id: 'h_fixed_2026-10-17', habitId: 'h_fixed', date: '2026-10-17', completed: true });
const fixedStreakSatDone = core.calculateHabitStreaks(fixedHabit, compMap, '2026-10-17');
assert.strictEqual(fixedStreakSatDone.currentStreak, 7, 'Completing today immediately increments streak to 7');
console.log('[PASS] 3. Fixed weekday schedule streaks & unscheduled day skipping verified.');

// 4. Flexible Weekly Target Schedule Test (3x per Sat-Fri week)
const flexHabit = {
  id: 'h_flex',
  name: 'Read 30 Mins',
  frequencyType: 'weekly_target',
  weeklyTarget: 3,
  startDate: '2026-10-03', // Week 1: Oct 3 (Sat) - Oct 9 (Fri)
  status: 'active'
};
// Complete 3 times in Week 1 (Sat Oct 3, Mon Oct 5, Thu Oct 8)
['2026-10-03', '2026-10-05', '2026-10-08'].forEach(d => {
  compMap.set(`h_flex_${d}`, { id: `h_flex_${d}`, habitId: 'h_flex', date: d, completed: true });
});
// Complete 3 times in Week 2 (Sun Oct 11, Tue Oct 13, Wed Oct 14)
['2026-10-11', '2026-10-13', '2026-10-14'].forEach(d => {
  compMap.set(`h_flex_${d}`, { id: `h_flex_${d}`, habitId: 'h_flex', date: d, completed: true });
});
// On Thursday Oct 15 (still in Week 2), weekly target (3/3) is ALREADY met!
const evalFlexThu = core.evaluateHabitOnDate(flexHabit, '2026-10-15', compMap);
assert.strictEqual(evalFlexThu.weeklyTargetMet, true, 'Weekly target should be marked as met on Oct 15');
assert.strictEqual(evalFlexThu.eligibleForRate, false, 'Once weekly target is met, remaining uncompleted days in week are not required');

const flexStreak = core.calculateHabitStreaks(flexHabit, compMap, '2026-10-15');
assert.strictEqual(flexStreak.currentStreak, 6, 'Flexible weekly streak should sum 6 completions across 2 successful weeks');
assert.strictEqual(flexStreak.currentWeeksStreak, 2, 'Consecutive successful weeks should be 2');
console.log('[PASS] 4. Flexible weekly target eligibility & streak algorithm verified.');

// 5. Heatmap Intensity Levels (0-4) and Special States (future, no_data, unscheduled)
const cellFuture = core.getHeatmapCellState([fixedHabit], '2026-10-20', compMap, '2026-10-15');
assert.strictEqual(cellFuture.state, 'future', 'Dates after today must have state=future');

const cellNoData = core.getHeatmapCellState([fixedHabit], '2026-09-01', compMap, '2026-10-15');
assert.strictEqual(cellNoData.state, 'no_data', 'Dates before earliest habit startDate must have state=no_data');

const cellUnscheduled = core.getHeatmapCellState([fixedHabit], '2026-10-04', compMap, '2026-10-15'); // Sunday Oct 4
assert.strictEqual(cellUnscheduled.state, 'unscheduled', 'Unscheduled Sunday must have state=unscheduled');

const cellLevel4 = core.getHeatmapCellState([fixedHabit], '2026-10-14', compMap, '2026-10-15'); // Wednesday Oct 14 (completed)
assert.strictEqual(cellLevel4.state, 'scheduled');
assert.strictEqual(cellLevel4.level, 4, '100% completion must be Level 4');
console.log('[PASS] 5. Heatmap intensity levels (0-4) and special states verified.');

// 6. Backup Payload Validation
const validPayload = {
  version: 2,
  exportedAt: new Date().toISOString(),
  habits: [fixedHabit, flexHabit],
  categories: core.DEFAULT_CATEGORIES,
  completions: Array.from(compMap.values()),
  notes: [{ date: '2026-10-15', text: 'Great progress today!' }]
};
const valRes = core.validateBackupPayload(validPayload);
assert.strictEqual(valRes.valid, true, 'Valid backup payload must pass validation');

const invalidPayload = {
  habits: [{ id: '', name: 'Bad', color: 'not-a-hex' }],
  categories: 'not-an-array',
  completions: [{ habitId: 'h1', date: '2026-02-30' }]
};
const invalRes = core.validateBackupPayload(invalidPayload);
assert.strictEqual(invalRes.valid, false, 'Invalid backup payload must fail validation');
assert(invalRes.errors.length >= 3, 'Should report specific validation errors');
console.log('[PASS] 6. Backup JSON export/import validation verified.');

console.log('=== ALL CORE ENGINE AUTOMATED TESTS PASSED ===');

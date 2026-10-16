/**
 * Core Engine for HabitFlow A55 — Production Habit Tracker
 * Implements:
 * 1. Local Calendar Date handling (YYYY-MM-DD without UTC drift)
 * 2. Mandatory Saturday-to-Friday Weekly Convention
 *    (0=Saturday, 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday)
 * 3. Flexible Habit Scheduling (daily, specific weekdays, flexible weekly_target)
 * 4. Fair Streak & Consistency Engine
 * 5. Activity Heatmap Intensity Calculator (Levels 0-4 + special states)
 * 6. Analytics & Category Aggregation Engine
 * 7. Backup Validation & Sanitization Engine
 */

const SAT_WEEKDAYS = [
  { satIdx: 0, jsDay: 6, short: 'Sat', narrow: 'S', long: 'Saturday' },
  { satIdx: 1, jsDay: 0, short: 'Sun', narrow: 'S', long: 'Sunday' },
  { satIdx: 2, jsDay: 1, short: 'Mon', narrow: 'M', long: 'Monday' },
  { satIdx: 3, jsDay: 2, short: 'Tue', narrow: 'T', long: 'Tuesday' },
  { satIdx: 4, jsDay: 3, short: 'Wed', narrow: 'W', long: 'Wednesday' },
  { satIdx: 5, jsDay: 4, short: 'Thu', narrow: 'T', long: 'Thursday' },
  { satIdx: 6, jsDay: 5, short: 'Fri', narrow: 'F', long: 'Friday' }
];

const PRESET_COLORS = [
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Yellow', hex: '#EAB308' }
];

const DEFAULT_CATEGORIES = [
  { id: 'cat_health', name: 'Health & Fitness', color: '#22C55E', icon: '💪', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_study', name: 'Study & Learning', color: '#3B82F6', icon: '📚', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_productivity', name: 'Productivity', color: '#A855F7', icon: '⚡', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_personal', name: 'Personal Development', color: '#F97316', icon: '🌱', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_spirituality', name: 'Spirituality', color: '#06B6D4', icon: '🕌', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cat_lifestyle', name: 'Lifestyle', color: '#EC4899', icon: '🏡', createdAt: '2026-01-01T00:00:00.000Z' }
];

// --- 1. Local Date Utilities (Zero UTC Drift) ---
function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatLocalDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}-${m}-${d}`;
}

function getTodayLocalStr(nowOverride) {
  if (typeof nowOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nowOverride)) {
    return nowOverride;
  }
  const d = nowOverride instanceof Date ? nowOverride : new Date();
  return formatLocalDate(d);
}

function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return dt.getFullYear() === y && (dt.getMonth() + 1) === m && dt.getDate() === d;
}

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Use noon local time to prevent any DST midnight boundary shifts
  return new Date(y, m - 1, d, 12, 0, 0);
}

function addDays(dateStr, deltaDays) {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + deltaDays);
  return formatLocalDate(dt);
}

function diffDays(startStr, endStr) {
  const d1 = parseLocalDate(startStr);
  const d2 = parseLocalDate(endStr);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function getDateRangeArray(startStr, endStr) {
  if (startStr > endStr) return [];
  const res = [];
  let cur = startStr;
  while (cur <= endStr) {
    res.push(cur);
    cur = addDays(cur, 1);
  }
  return res;
}

// --- 2. Mandatory Saturday-to-Friday Weekly Convention ---
/**
 * Converts a YYYY-MM-DD local date to Saturday-first weekday index:
 * 0 = Saturday, 1 = Sunday, 2 = Monday, 3 = Tuesday, 4 = Wednesday, 5 = Thursday, 6 = Friday
 */
function getSatDayIndex(dateStr) {
  const jsDay = parseLocalDate(dateStr).getDay(); // 0=Sun .. 6=Sat
  return (jsDay + 1) % 7;
}

function getWeekdayInfo(dateStr) {
  return SAT_WEEKDAYS[getSatDayIndex(dateStr)];
}

function getWeekStartSaturday(dateStr) {
  const satIdx = getSatDayIndex(dateStr);
  return addDays(dateStr, -satIdx);
}

function getWeekEndFriday(dateStr) {
  const satIdx = getSatDayIndex(dateStr);
  return addDays(dateStr, 6 - satIdx);
}

function getSatToFriWeekDates(dateStr) {
  const sat = getWeekStartSaturday(dateStr);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    dates.push(addDays(sat, i));
  }
  return dates;
}

/**
 * Generates a 42-cell (6 weeks x 7 days) or 35/42-cell Saturday-first calendar matrix for a given year and month (1-12)
 */
function getMonthlyCalendarGrid(year, month) {
  const firstDayStr = `${year}-${pad2(month)}-01`;
  const lastDayObj = new Date(year, month, 0, 12, 0, 0);
  const lastDayStr = formatLocalDate(lastDayObj);
  const gridStartSat = getWeekStartSaturday(firstDayStr);
  const gridEndFri = getWeekEndFriday(lastDayStr);
  const allDates = getDateRangeArray(gridStartSat, gridEndFri);
  const weeks = [];
  for (let i = 0; i < allDates.length; i += 7) {
    const chunk = allDates.slice(i, i + 7).map(dStr => {
      const [y, m, d] = dStr.split('-').map(Number);
      return {
        dateStr: dStr,
        year: y,
        month: m,
        day: d,
        satIdx: getSatDayIndex(dStr),
        isCurrentMonth: y === year && m === month
      };
    });
    weeks.push(chunk);
  }
  return {
    year,
    month,
    firstDayStr,
    lastDayStr,
    gridStartSat,
    gridEndFri,
    weeks
  };
}

/**
 * Generates Saturday-to-Friday week rows for an entire year (Jan 1 to Dec 31)
 */
function getYearlyHeatmapWeeks(year) {
  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const gridStartSat = getWeekStartSaturday(jan1);
  const gridEndFri = getWeekEndFriday(dec31);
  const allDates = getDateRangeArray(gridStartSat, gridEndFri);
  const weeks = [];
  for (let i = 0; i < allDates.length; i += 7) {
    const weekDates = allDates.slice(i, i + 7);
    // Determine if this week contains the 1st of any month in `year`
    let monthLabel = null;
    const firstOfMonthInWeek = weekDates.find(d => d.startsWith(`${year}-`) && d.endsWith('-01'));
    if (firstOfMonthInWeek) {
      const m = Number(firstOfMonthInWeek.slice(5, 7));
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      monthLabel = monthNames[m - 1];
    } else if (i === 0) {
      monthLabel = 'Jan';
    }
    weeks.push({
      weekIndex: weeks.length,
      startSat: weekDates[0],
      endFri: weekDates[6],
      monthLabel,
      days: weekDates.map(dStr => {
        const [y, m, d] = dStr.split('-').map(Number);
        return {
          dateStr: dStr,
          year: y,
          month: m,
          day: d,
          satIdx: getSatDayIndex(dStr),
          inTargetYear: y === year
        };
      })
    });
  }
  return weeks;
}

// --- 3. Habit Scheduling & Eligibility Logic ---
function isHabitWithinActiveWindow(habit, dateStr) {
  if (!habit) return false;
  const start = habit.startDate || '2020-01-01';
  if (dateStr < start) return false;
  if (habit.endDate && habit.endDate.trim() !== '' && dateStr > habit.endDate) return false;
  return true;
}

/**
 * Returns how many completions a habit has in the Saturday-to-Friday week containing `dateStr`
 */
function getWeekCompletionsForHabit(habitId, dateStr, completionMap, upToDateStr = null) {
  const weekDates = getSatToFriWeekDates(dateStr);
  let count = 0;
  const completedDates = [];
  for (const d of weekDates) {
    if (upToDateStr && d > upToDateStr) continue;
    const rec = completionMap.get(`${habitId}_${d}`);
    if (rec && rec.completed) {
      count++;
      completedDates.push(d);
    }
  }
  return { count, completedDates, weekDates };
}

/**
 * Computes effective weekly target for a `weekly_target` habit in a given Saturday-to-Friday week,
 * prorated if the habit started or ended mid-week.
 */
function getEffectiveWeeklyTarget(habit, anyDateInWeekStr) {
  const weekDates = getSatToFriWeekDates(anyDateInWeekStr);
  const activeDays = weekDates.filter(d => isHabitWithinActiveWindow(habit, d));
  if (activeDays.length === 0) return 0;
  const rawTarget = Math.max(1, Math.min(7, Number(habit.weeklyTarget) || 3));
  return Math.min(rawTarget, activeDays.length);
}

/**
 * Determines if a habit is scheduled/eligible on `dateStr`.
 * Returns:
 * - scheduled: boolean (should appear on Tasks list / daily detail)
 * - eligibleForRate: boolean (counts in denominator of daily completion percentage)
 * - weeklyTargetMet: boolean (for flexible weekly_target habits where weekly goal is already achieved on other days)
 * - reason: string
 */
function evaluateHabitOnDate(habit, dateStr, completionMap) {
  if (!isHabitWithinActiveWindow(habit, dateStr)) {
    return { scheduled: false, eligibleForRate: false, weeklyTargetMet: false, reason: 'outside_date_window' };
  }
  const isCompletedToday = Boolean(completionMap.get(`${habit.id}_${dateStr}`)?.completed);
  const freq = habit.frequencyType || 'daily';

  if (freq === 'daily') {
    return { scheduled: true, eligibleForRate: true, weeklyTargetMet: false, reason: 'daily' };
  }

  if (freq === 'weekdays') {
    const satIdx = getSatDayIndex(dateStr);
    const days = Array.isArray(habit.scheduledDays) ? habit.scheduledDays.map(Number) : [0, 1, 2, 3, 4, 5, 6];
    const isDayMatch = days.includes(satIdx);
    return {
      scheduled: isDayMatch,
      eligibleForRate: isDayMatch,
      weeklyTargetMet: false,
      reason: isDayMatch ? 'scheduled_weekday' : 'unscheduled_weekday'
    };
  }

  if (freq === 'weekly_target') {
    const target = getEffectiveWeeklyTarget(habit, dateStr);
    if (target === 0) {
      return { scheduled: false, eligibleForRate: false, weeklyTargetMet: false, reason: 'outside_date_window' };
    }
    const { count: totalInWeek, weekDates } = getWeekCompletionsForHabit(habit.id, dateStr, completionMap);
    if (isCompletedToday) {
      return {
        scheduled: true,
        eligibleForRate: true,
        weeklyTargetMet: totalInWeek >= target,
        weeklyProgress: { current: totalInWeek, target },
        reason: 'weekly_target_completed_today'
      };
    }
    // Not completed on dateStr:
    if (totalInWeek >= target) {
      // Weekly target already met on other days of this Sat-Fri week!
      // Still show in Tasks with "Target Met" badge, but do NOT penalize as an incomplete required occurrence on this day.
      return {
        scheduled: true,
        eligibleForRate: false,
        weeklyTargetMet: true,
        weeklyProgress: { current: totalInWeek, target },
        reason: 'weekly_target_already_met'
      };
    }
    // Check if remaining active days in the week (from dateStr through Friday) are needed to meet target
    const activeRemainingDaysAfterToday = weekDates.filter(d => d > dateStr && isHabitWithinActiveWindow(habit, d)).length;
    const needed = target - totalInWeek;
    // On Tasks screen it's always actionable; for historical daily rate, it's required on the last `needed` days of the week (or today)
    const isRequiredToday = activeRemainingDaysAfterToday < needed;
    return {
      scheduled: true,
      eligibleForRate: isRequiredToday,
      weeklyTargetMet: false,
      weeklyProgress: { current: totalInWeek, target },
      reason: isRequiredToday ? 'weekly_target_due' : 'weekly_target_flexible_optional_day'
    };
  }

  return { scheduled: true, eligibleForRate: true, weeklyTargetMet: false, reason: 'default' };
}

/**
 * Calculates daily summary for a given dateStr across a list of habits.
 * For Tasks screen, users want to see all scheduled habits for that date,
 * where flexible weekly habits that have NOT yet met their weekly target are actionable on `dateStr`.
 */
function getDailyScheduleSummary(habits, dateStr, completionMap, options = {}) {
  const includeArchived = Boolean(options.includeArchived);
  const forTasksScreen = Boolean(options.forTasksScreen);
  const relevantHabits = habits.filter(h => includeArchived || h.status !== 'archived');

  const scheduledItems = [];
  let eligibleCount = 0;
  let completedEligibleCount = 0;

  for (const habit of relevantHabits) {
    const evalRes = evaluateHabitOnDate(habit, dateStr, completionMap);
    const isCompleted = Boolean(completionMap.get(`${habit.id}_${dateStr}`)?.completed);

    if (!evalRes.scheduled) continue;

    // On the Tasks screen (or today's active view), if a weekly_target habit has NOT met its weekly target yet,
    // count it in today's actionable tasks unless its weekly target is already met on earlier days of the week.
    const countsForDailyGoal = (habit.frequencyType === 'weekly_target' && forTasksScreen)
      ? (!evalRes.weeklyTargetMet || isCompleted)
      : evalRes.eligibleForRate;

    if (countsForDailyGoal) {
      eligibleCount++;
      if (isCompleted) completedEligibleCount++;
    }

    scheduledItems.push({
      habit,
      isCompleted,
      countsForDailyGoal,
      evalRes
    });
  }

  const remainingCount = Math.max(0, eligibleCount - completedEligibleCount);
  const percentage = eligibleCount > 0 ? Math.round((completedEligibleCount / eligibleCount) * 100) : null;

  return {
    dateStr,
    scheduledItems,
    eligibleCount,
    completedEligibleCount,
    remainingCount,
    percentage
  };
}

// --- 4. Fair Streak & Consistency Engine ---
/**
 * Calculates Current Streak and Longest Streak for a habit up to `todayStr`.
 * - Fixed schedules (`daily`, `weekdays`):
 *   Evaluates only scheduled dates within [startDate, min(todayStr, endDate)].
 *   Unscheduled weekdays are skipped and NEVER break a streak.
 *   If `todayStr` is scheduled and not yet completed, `todayStr` does not break the streak from previous scheduled days.
 * - Flexible weekly target (`weekly_target`):
 *   Evaluates Saturday-to-Friday weeks from the week of `startDate` to the week of `todayStr`.
 *   A past week succeeds if `completionsInWeek >= effectiveTarget`.
 *   The current week (containing `todayStr`) is still active: if `completionsInWeek + remainingDays >= effectiveTarget`,
 *   it does not break the streak, and any completions this week add to the current streak!
 */
function calculateHabitStreaks(habit, completionMap, todayStr) {
  if (!habit || !habit.startDate || habit.startDate > todayStr) {
    return { currentStreak: 0, longestStreak: 0, totalCompleted: 0, unit: 'days', explanation: 'Not started yet' };
  }

  const effectiveEnd = (habit.endDate && habit.endDate < todayStr) ? habit.endDate : todayStr;
  const allDates = getDateRangeArray(habit.startDate, effectiveEnd);

  let totalCompleted = 0;
  for (const d of allDates) {
    if (completionMap.get(`${habit.id}_${d}`)?.completed) {
      totalCompleted++;
    }
  }

  const freq = habit.frequencyType || 'daily';

  if (freq === 'daily' || freq === 'weekdays') {
    const scheduledDaysSet = freq === 'weekdays'
      ? new Set((habit.scheduledDays || []).map(Number))
      : null;

    const scheduledDates = allDates.filter(d => {
      if (freq === 'daily') return true;
      return scheduledDaysSet.has(getSatDayIndex(d));
    });

    let longestStreak = 0;
    let running = 0;
    for (const d of scheduledDates) {
      const done = Boolean(completionMap.get(`${habit.id}_${d}`)?.completed);
      if (done) {
        running++;
        if (running > longestStreak) longestStreak = running;
      } else {
        running = 0;
      }
    }

    // Current streak walking backward from latest scheduled date
    let currentStreak = 0;
    for (let i = scheduledDates.length - 1; i >= 0; i--) {
      const d = scheduledDates[i];
      const done = Boolean(completionMap.get(`${habit.id}_${d}`)?.completed);
      if (done) {
        currentStreak++;
      } else {
        // Grace period for today if today is not over yet
        if (d === todayStr) {
          continue;
        }
        break;
      }
    }

    return {
      currentStreak,
      longestStreak,
      totalCompleted,
      unit: freq === 'daily' ? 'days' : 'scheduled days',
      explanation: freq === 'daily'
        ? 'Consecutive scheduled days completed (today in-progress does not break streak).'
        : 'Consecutive scheduled weekdays completed; unscheduled days are skipped.'
    };
  }

  // Flexible Weekly Target (`weekly_target`)
  const firstSat = getWeekStartSaturday(habit.startDate);
  const lastSat = getWeekStartSaturday(effectiveEnd);
  const weekStarts = [];
  let curSat = firstSat;
  while (curSat <= lastSat) {
    weekStarts.push(curSat);
    curSat = addDays(curSat, 7);
  }

  let longestStreak = 0;
  let runningCompletions = 0;
  let consecutiveSuccessfulWeeks = 0;
  let longestWeeks = 0;

  const currentWeekSat = getWeekStartSaturday(todayStr);

  const weekOutcomes = weekStarts.map(sat => {
    const target = getEffectiveWeeklyTarget(habit, sat);
    const { count } = getWeekCompletionsForHabit(habit.id, sat, completionMap, effectiveEnd);
    const isCurrentWeek = sat === currentWeekSat;
    const weekDates = getSatToFriWeekDates(sat);
    const remainingActiveDays = isCurrentWeek
      ? weekDates.filter(d => d >= todayStr && isHabitWithinActiveWindow(habit, d) && !completionMap.get(`${habit.id}_${d}`)?.completed).length
      : 0;
    const met = count >= target;
    const canStillMeet = isCurrentWeek && (count + remainingActiveDays >= target);
    return { sat, target, count, met, isCurrentWeek, canStillMeet };
  });

  for (const w of weekOutcomes) {
    if (w.target === 0) continue;
    if (w.met) {
      runningCompletions += w.count;
      consecutiveSuccessfulWeeks++;
      if (runningCompletions > longestStreak) longestStreak = runningCompletions;
      if (consecutiveSuccessfulWeeks > longestWeeks) longestWeeks = consecutiveSuccessfulWeeks;
    } else if (w.isCurrentWeek && w.canStillMeet) {
      if (runningCompletions + w.count > longestStreak) {
        longestStreak = runningCompletions + w.count;
      }
    } else {
      runningCompletions = 0;
      consecutiveSuccessfulWeeks = 0;
    }
  }

  // Current streak walking backward across weeks
  let currentStreak = 0;
  let currentWeeksStreak = 0;
  for (let i = weekOutcomes.length - 1; i >= 0; i--) {
    const w = weekOutcomes[i];
    if (w.target === 0) continue;
    if (w.met) {
      currentStreak += w.count;
      currentWeeksStreak++;
    } else if (w.isCurrentWeek && w.canStillMeet) {
      currentStreak += w.count;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak,
    currentWeeksStreak,
    longestWeeks,
    totalCompleted,
    unit: 'completions',
    explanation: `Completions across consecutive Sat–Fri weeks meeting target (${habit.weeklyTarget}x/week). Active current week is not penalized while target is still reachable.`
  };
}

// --- 5. Heatmap Activity Intensity (Levels 0 to 4 + Special States) ---
/**
 * Calculates heatmap intensity for a date `dateStr`.
 * States:
 * - 'future': dateStr > todayStr
 * - 'no_data': dateStr < earliest habit startDate
 * - 'unscheduled': 0 scheduled habits on dateStr
 * - 'scheduled': has >=1 scheduled/eligible habit, with level 0..4:
 *   - Level 0: ratio === 0 (0% completed)
 *   - Level 1: 0 < ratio <= 0.35 (Low activity)
 *   - Level 2: 0.35 < ratio <= 0.69 (Moderate activity)
 *   - Level 3: 0.69 < ratio < 1.0 (High activity)
 *   - Level 4: ratio === 1.0 (All eligible scheduled occurrences completed)
 */
function getHeatmapCellState(habits, dateStr, completionMap, todayStr, filterHabitId = 'all') {
  const targetHabits = filterHabitId && filterHabitId !== 'all'
    ? habits.filter(h => h.id === filterHabitId)
    : habits.filter(h => h.status !== 'archived' || isHabitWithinActiveWindow(h, dateStr));

  if (dateStr > todayStr) {
    return {
      dateStr,
      state: 'future',
      level: 0,
      ratio: 0,
      completed: 0,
      eligible: 0,
      label: 'Future date'
    };
  }

  if (targetHabits.length === 0) {
    return {
      dateStr,
      state: 'no_data',
      level: 0,
      ratio: 0,
      completed: 0,
      eligible: 0,
      label: 'No tracked habits'
    };
  }

  const earliestStart = targetHabits.reduce((min, h) => (h.startDate < min ? h.startDate : min), '9999-12-31');
  if (dateStr < earliestStart) {
    return {
      dateStr,
      state: 'no_data',
      level: 0,
      ratio: 0,
      completed: 0,
      eligible: 0,
      label: 'No historical data'
    };
  }

  const summary = getDailyScheduleSummary(targetHabits, dateStr, completionMap, {
    includeArchived: true,
    forTasksScreen: dateStr === todayStr
  });

  if (summary.eligibleCount === 0) {
    // Check if any flexible weekly habit was completed on this day even if already met
    const anyCompleted = summary.scheduledItems.filter(i => i.isCompleted).length;
    if (anyCompleted > 0) {
      return {
        dateStr,
        state: 'scheduled',
        level: 4,
        ratio: 1,
        completed: anyCompleted,
        eligible: anyCompleted,
        label: `${anyCompleted}/${anyCompleted} completed (100%)`
      };
    }
    return {
      dateStr,
      state: 'unscheduled',
      level: 0,
      ratio: 0,
      completed: 0,
      eligible: 0,
      label: 'No habits scheduled'
    };
  }

  const ratio = summary.completedEligibleCount / summary.eligibleCount;
  let level = 0;
  if (ratio === 0) level = 0;
  else if (ratio <= 0.35) level = 1;
  else if (ratio <= 0.69) level = 2;
  else if (ratio < 1.0) level = 3;
  else level = 4;

  return {
    dateStr,
    state: 'scheduled',
    level,
    ratio,
    completed: summary.completedEligibleCount,
    eligible: summary.eligibleCount,
    percentage: Math.round(ratio * 100),
    label: `${summary.completedEligibleCount}/${summary.eligibleCount} completed (${Math.round(ratio * 100)}%)`
  };
}

// --- 6. Period Completion Rate Calculator (Excludes future & unscheduled days) ---
function calculatePeriodStats(habits, completionMap, startDateStr, endDateStr, todayStr) {
  const effectiveEnd = endDateStr > todayStr ? todayStr : endDateStr;
  if (startDateStr > effectiveEnd) {
    return { eligible: 0, completed: 0, rate: 0 };
  }
  const dates = getDateRangeArray(startDateStr, effectiveEnd);
  let totalEligible = 0;
  let totalCompleted = 0;

  for (const h of habits) {
    if ((h.frequencyType || 'daily') === 'weekly_target') {
      // Evaluate weekly target habits across Saturday-to-Friday buckets overlapping the period
      for (const d of dates) {
        if (!isHabitWithinActiveWindow(h, d)) continue;
        const evalRes = evaluateHabitOnDate(h, d, completionMap);
        const done = Boolean(completionMap.get(`${h.id}_${d}`)?.completed);
        if (evalRes.eligibleForRate) {
          totalEligible++;
          if (done) totalCompleted++;
        }
      }
    } else {
      for (const d of dates) {
        const evalRes = evaluateHabitOnDate(h, d, completionMap);
        if (evalRes.eligibleForRate) {
          totalEligible++;
          if (completionMap.get(`${h.id}_${d}`)?.completed) {
            totalCompleted++;
          }
        }
      }
    }
  }

  const rate = totalEligible > 0 ? Math.round((totalCompleted / totalEligible) * 100) : 0;
  return { eligible: totalEligible, completed: totalCompleted, rate };
}

// --- 7. Color & Backup Validation ---
function isValidHexColor(hex) {
  return typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
}

function validateBackupPayload(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Backup payload must be a JSON object.'] };
  }
  if (!Array.isArray(data.habits)) {
    errors.push('Missing or invalid "habits" array.');
  } else {
    data.habits.forEach((h, idx) => {
      if (!h || typeof h.id !== 'string' || !h.id.trim()) errors.push(`Habit at index ${idx} is missing a valid string "id".`);
      if (!h || typeof h.name !== 'string' || !h.name.trim()) errors.push(`Habit at index ${idx} is missing a valid "name".`);
      if (h && h.color && !isValidHexColor(h.color)) errors.push(`Habit "${h.name || idx}" has invalid HEX color "${h.color}".`);
      if (h && h.startDate && !isValidDateStr(h.startDate)) errors.push(`Habit "${h.name || idx}" has invalid startDate "${h.startDate}".`);
    });
  }

  if (!Array.isArray(data.categories)) {
    errors.push('Missing or invalid "categories" array.');
  } else {
    data.categories.forEach((c, idx) => {
      if (!c || typeof c.id !== 'string' || !c.id.trim()) errors.push(`Category at index ${idx} is missing a valid string "id".`);
      if (!c || typeof c.name !== 'string' || !c.name.trim()) errors.push(`Category at index ${idx} is missing a valid "name".`);
    });
  }

  if (!Array.isArray(data.completions)) {
    errors.push('Missing or invalid "completions" array.');
  } else {
    data.completions.forEach((rec, idx) => {
      if (!rec || typeof rec.habitId !== 'string' || !rec.habitId.trim()) errors.push(`Completion at index ${idx} is missing "habitId".`);
      if (!rec || !isValidDateStr(rec.date)) errors.push(`Completion at index ${idx} has invalid date "${rec?.date}".`);
    });
  }

  if (data.notes !== undefined && !Array.isArray(data.notes)) {
    errors.push('"notes" field must be an array when provided.');
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: errors.length === 0 ? {
      habits: data.habits.length,
      categories: data.categories.length,
      completions: data.completions.length,
      notes: Array.isArray(data.notes) ? data.notes.length : 0
    } : null
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SAT_WEEKDAYS,
    PRESET_COLORS,
    DEFAULT_CATEGORIES,
    formatLocalDate,
    getTodayLocalStr,
    isValidDateStr,
    parseLocalDate,
    addDays,
    diffDays,
    getDateRangeArray,
    getSatDayIndex,
    getWeekdayInfo,
    getWeekStartSaturday,
    getWeekEndFriday,
    getSatToFriWeekDates,
    getMonthlyCalendarGrid,
    getYearlyHeatmapWeeks,
    isHabitWithinActiveWindow,
    getWeekCompletionsForHabit,
    getEffectiveWeeklyTarget,
    evaluateHabitOnDate,
    getDailyScheduleSummary,
    calculateHabitStreaks,
    getHeatmapCellState,
    calculatePeriodStats,
    isValidHexColor,
    validateBackupPayload
  };
}

// Week and time-of-day helpers in a configured IANA time zone (no dependencies).
function localParts(date, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23',
  });
  const p = {};
  for (const x of fmt.formatToParts(date)) p[x.type] = x.value;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) };
}

// ISO week for a calendar date. weekday: Monday = 0 ... Sunday = 6.
function isoWeek(year, month, day) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  const weekday = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - weekday + 3);
  const isoYear = dt.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Weekday = (jan4.getUTCDay() + 6) % 7;
  const week = 1 + Math.round(((dt - jan4) / 86400000 - 3 + jan4Weekday) / 7);
  return { isoYear, week, weekday };
}

function weekKey(date, tz) {
  const l = localParts(date, tz);
  const w = isoWeek(l.year, l.month, l.day);
  return `${w.isoYear}-W${String(w.week).padStart(2, '0')}`;
}

// { weekday, hour } in the zone, Monday = 0.
function localWeekdayHour(date, tz) {
  const l = localParts(date, tz);
  return { weekday: isoWeek(l.year, l.month, l.day).weekday, hour: l.hour };
}

function validTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}

module.exports = { weekKey, localWeekdayHour, validTimeZone };

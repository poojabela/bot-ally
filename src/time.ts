export function localTimeToDate(localTime: string, timezone: string) {
  const asUtc = new Date(`${localTime}Z`);
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(asUtc)
    .find((part) => part.type === 'timeZoneName')!.value;
  const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMinutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(asUtc.getTime() - offsetMinutes * 60_000);
}

export function localDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function localTimeOfDay(date: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export function startOfLocalDay(date: Date, timezone: string) {
  return localTimeToDate(`${localDate(date, timezone)}T00:00:00`, timezone);
}

export function nextDailyRun(timeOfDay: string, timezone: string, after = new Date()) {
  const today = localDate(after, timezone);
  const todayRun = localTimeToDate(`${today}T${timeOfDay}:00`, timezone);
  if (todayRun > after) return todayRun;
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return localTimeToDate(`${tomorrow}T${timeOfDay}:00`, timezone);
}

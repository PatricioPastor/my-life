export type Greeting = "buenoniaa" | "buenanochee"

const DAY_START_HOUR = 6
const NIGHT_START_HOUR = 20

/** Day greeting from 6:00 to 19:59 local time, night greeting otherwise. */
export function greetingFor(date: Date): Greeting {
  const hour = date.getHours()
  return hour >= DAY_START_HOUR && hour < NIGHT_START_HOUR ? "buenoniaa" : "buenanochee"
}

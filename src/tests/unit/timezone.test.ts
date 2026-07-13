import { describe, it, expect } from "vitest";
import {
  zonedWallTimeToUtc,
  weekdayOfLocalDate,
  formatTimeInZone,
  localDateInZone,
} from "@/lib/booking/timezone";

describe("weekdayOfLocalDate", () => {
  it("returns 1 for Monday", () => {
    expect(weekdayOfLocalDate("2025-06-09")).toBe(1); // Monday
  });

  it("returns 0 for Sunday", () => {
    expect(weekdayOfLocalDate("2025-06-08")).toBe(0); // Sunday
  });

  it("returns 6 for Saturday", () => {
    expect(weekdayOfLocalDate("2025-06-07")).toBe(6); // Saturday
  });

  it("returns 5 for Friday", () => {
    expect(weekdayOfLocalDate("2025-06-06")).toBe(5); // Friday
  });
});

describe("zonedWallTimeToUtc", () => {
  it("converts Europe/Madrid CEST time to UTC (UTC+2 in summer)", () => {
    // 10:00 Madrid CEST = 08:00 UTC
    const utc = zonedWallTimeToUtc("2025-06-09", "10:00", "Europe/Madrid");
    expect(utc.getUTCHours()).toBe(8);
    expect(utc.getUTCMinutes()).toBe(0);
  });

  it("converts Europe/Madrid CET time to UTC (UTC+1 in winter)", () => {
    // 10:00 Madrid CET = 09:00 UTC
    const utc = zonedWallTimeToUtc("2025-01-09", "10:00", "Europe/Madrid");
    expect(utc.getUTCHours()).toBe(9);
    expect(utc.getUTCMinutes()).toBe(0);
  });

  it("converts UTC zone without offset", () => {
    const utc = zonedWallTimeToUtc("2025-06-09", "14:30", "UTC");
    expect(utc.getUTCHours()).toBe(14);
    expect(utc.getUTCMinutes()).toBe(30);
  });

  it("handles HH:MM:SS input", () => {
    const utc = zonedWallTimeToUtc("2025-06-09", "09:15:30", "UTC");
    expect(utc.getUTCHours()).toBe(9);
    expect(utc.getUTCMinutes()).toBe(15);
    expect(utc.getUTCSeconds()).toBe(30);
  });
});

describe("formatTimeInZone", () => {
  it("formats UTC ISO as local time in Europe/Madrid (CEST)", () => {
    // 08:00 UTC = 10:00 Madrid CEST
    const result = formatTimeInZone("2025-06-09T08:00:00.000Z", "Europe/Madrid");
    expect(result).toBe("10:00");
  });

  it("formats UTC ISO as local time in UTC", () => {
    const result = formatTimeInZone("2025-06-09T14:30:00.000Z", "UTC");
    expect(result).toBe("14:30");
  });
});

describe("localDateInZone", () => {
  it("returns YYYY-MM-DD string for a given instant", () => {
    // 23:00 UTC on June 9 = June 10 in Madrid CEST (UTC+2)
    const result = localDateInZone("Europe/Madrid", new Date("2025-06-09T23:00:00.000Z"));
    expect(result).toBe("2025-06-10");
  });

  it("returns same date in UTC", () => {
    const result = localDateInZone("UTC", new Date("2025-06-09T12:00:00.000Z"));
    expect(result).toBe("2025-06-09");
  });
});

import { describe, it, expect } from "vitest"
import { statusColor, impactColor, formatDate } from "../../lib/dashboard/formatters"

describe("statusColor", () => {
  it("returns green class for completed", () => {
    expect(statusColor("completed")).toContain("green")
  })
  it("returns yellow class for running", () => {
    expect(statusColor("running")).toContain("yellow")
  })
  it("returns red class for failed", () => {
    expect(statusColor("failed")).toContain("red")
  })
  it("returns gray class for unknown status", () => {
    expect(statusColor("unknown")).toContain("gray")
  })
})

describe("impactColor", () => {
  it("returns red class for high", () => {
    expect(impactColor("high")).toContain("red")
  })
  it("returns yellow class for medium", () => {
    expect(impactColor("medium")).toContain("yellow")
  })
  it("returns blue class for low", () => {
    expect(impactColor("low")).toContain("blue")
  })
})

describe("formatDate", () => {
  it("formats ISO date to DD/MM/YYYY, HH:mm in Europe/Madrid timezone", () => {
    expect(formatDate("2026-05-26T09:00:00Z")).toBe("26/05/2026, 11:00")
  })
  it("returns guión for null", () => {
    expect(formatDate(null)).toBe("—")
  })
})

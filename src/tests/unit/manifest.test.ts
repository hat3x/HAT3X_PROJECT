import { describe, it, expect } from "vitest";

import manifest from "@/app/manifest";

describe("PWA manifest de Kairos", () => {
  const m = manifest();

  it("es instalable: standalone, nombre y scope correctos", () => {
    expect(m.name).toBe("Kairos");
    expect(m.short_name).toBe("Kairos");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.theme_color).toBe("#1A1815");
  });

  it("declara iconos 192 y 512 y al menos uno maskable", () => {
    const icons = m.icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(icons.every((i) => typeof i.src === "string" && i.src.endsWith(".png"))).toBe(true);
  });
});

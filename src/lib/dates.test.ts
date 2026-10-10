import { describe, expect, it } from "vitest";
import { aujourdhuiISO, dateValide, estWeekEnd, formaterDateLongue, hierISO } from "./dates";

describe("dates du classeur", () => {
  it("hier = la veille, avec l'heure locale (jamais UTC)", () => {
    expect(hierISO(new Date(2026, 9, 10, 0, 5))).toBe("2026-10-09");
    expect(hierISO(new Date(2026, 9, 10, 23, 55))).toBe("2026-10-09");
  });

  it("hier traverse les fins de mois et d'année", () => {
    expect(hierISO(new Date(2026, 2, 1))).toBe("2026-02-28");
    expect(hierISO(new Date(2027, 0, 1))).toBe("2026-12-31");
  });

  it("aujourd'hui en ISO", () => {
    expect(aujourdhuiISO(new Date(2026, 9, 10, 15))).toBe("2026-10-10");
  });

  it("valide les vraies dates seulement", () => {
    expect(dateValide("2026-10-08")).toBe(true);
    expect(dateValide("2026-02-30")).toBe(false);
    expect(dateValide("08/10/2026")).toBe(false);
    expect(dateValide("")).toBe(false);
  });

  it("écrit le jour de la semaine et repère le week-end", () => {
    expect(formaterDateLongue("2026-10-10")).toBe("samedi 10 octobre 2026");
    expect(estWeekEnd("2026-10-10")).toBe(true);
    expect(estWeekEnd("2026-10-11")).toBe(true);
    expect(estWeekEnd("2026-10-09")).toBe(false);
  });
});

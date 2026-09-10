import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  LOCALE_ES_ES,
} from "../../src/ui/locale/intl-formatters.js";
import {
  isMissingKey,
  MISSING_KEY_MARKER,
  resolveMessage,
  resolveMessageKey,
  resolveMessages,
} from "../../src/ui/locale/message-resolver.js";
import type { DomainMessage } from "../../src/domain/engine/transition.js";

describe("formateadores Intl es-ES (3.4)", () => {
  it("fija la locale es-ES explícita", () => {
    expect(LOCALE_ES_ES).toBe("es-ES");
  });

  it("formatea números con la convención es-ES (coma decimal, punto de miles)", () => {
    expect(formatNumber(1234.5)).toBe("1234,5");
    expect(
      formatNumber(1234567, { useGrouping: true, maximumFractionDigits: 0 }),
    ).toBe("1.234.567");
  });

  it("formatea una fecha fija en formato es-ES dd/mm/aaaa", () => {
    // 2024-06-06T00:00:00Z; se usa una hora fija para evitar depender del reloj.
    const date = new Date(Date.UTC(2024, 5, 6, 12, 0, 0));
    expect(formatDate(date, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })).toBe(
      "06/06/2024",
    );
  });

  it("formatea una hora en 24 h", () => {
    const date = new Date(Date.UTC(2024, 5, 6, 14, 30, 0));
    expect(
      formatTime(date, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }),
    ).toBe("14:30");
  });

  it("formatea fecha y hora combinadas", () => {
    const date = new Date(Date.UTC(2024, 0, 2, 9, 5, 0));
    const text = formatDateTime(date, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    });
    expect(text).toContain("02/01/2024");
    expect(text).toContain("09:05");
  });
});

describe("resolutor de DomainMessage a es-ES (3.1, 3.2, 3.3)", () => {
  it("resuelve una clave conocida interpolando parámetros", () => {
    const text = resolveMessageKey("ui.mission-selector.objective", {
      objective: "Eliminar la Unidad revelada",
    });
    expect(text).toBe("Objetivo: Eliminar la Unidad revelada");
  });

  it("formatea los parámetros numéricos en es-ES", () => {
    const text = resolveMessageKey("ui.mission-selector.base-turns", {
      baseTurns: 8,
    });
    expect(text).toBe("Turnos base: 8");
  });

  it("marca de forma visible una clave sin redacción (3.6)", () => {
    const text = resolveMessageKey("clave.inexistente");
    expect(text.startsWith(MISSING_KEY_MARKER)).toBe(true);
    expect(isMissingKey(text)).toBe(true);
    expect(text).toContain("clave.inexistente");
  });

  it("deja literal un marcador sin parámetro (fail-visible)", () => {
    const text = resolveMessageKey("ui.mission-selector.objective", {});
    expect(text).toBe("Objetivo: {objective}");
  });

  it("resuelve un DomainMessage completo del proyector de registros", () => {
    const message: DomainMessage = Object.freeze({
      messageKey: "log.simple.fire",
      params: Object.freeze({ turn: 3, actor: "Escuadra A", result: "impacto" }),
    });
    expect(resolveMessage(message)).toBe(
      "Turno 3: Escuadra A dispara. Resultado: impacto.",
    );
  });

  it("resuelve una lista de mensajes conservando el orden", () => {
    const messages: readonly DomainMessage[] = [
      { messageKey: "log.result.hit" },
      { messageKey: "log.result.miss" },
    ];
    expect(resolveMessages(messages)).toStrictEqual(["impacto", "fallo"]);
  });
});

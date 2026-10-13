import type { InstallmentType } from "./installments";

export function installmentLabel(type: InstallmentType, sequence: number): string {
  switch (type) {
    case "ANTICIPO":
      return "Anticipo (50%)";
    case "CUOTA":
      return `Cuota ${sequence - 1}`;
    case "PRIMER_PAGO":
      return "Primer pago";
    case "MENSUAL":
      return `Mes ${sequence}`;
    case "MANTENIMIENTO":
      return `Mantenimiento mes ${sequence}`;
  }
}

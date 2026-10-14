export const STAGE_LABEL = {
  COTIZACION: "Cotización / Propuesta",
  EN_DESARROLLO: "En Desarrollo",
  ENTREGADO: "Entregado",
  EN_MANTENIMIENTO: "En Mantenimiento",
} as const;

export const CONTRACT_LABEL = { PAGO_UNICO: "Pago Único", SUSCRIPCION: "Suscripción" } as const;
export const OWNER_LABEL = { CLIENTE: "Cliente", NARO: "Grupo Naro" } as const;
export const PLAN_LABEL = {
  DESARROLLO: "Desarrollo",
  SUSCRIPCION: "Suscripción",
  MANTENIMIENTO: "Mantenimiento",
} as const;
export const STATUS_LABEL = { PENDIENTE: "Pendiente", PAGADO: "Pagado", VENCIDO: "Vencido" } as const;
export const STATUS_CLASS = {
  PENDIENTE: "bg-amber-50 text-amber-700",
  PAGADO: "bg-emerald-50 text-emerald-700",
  VENCIDO: "bg-red-50 text-red-700",
} as const;
export const SERVICE_LABEL = { ACTIVO: "Activo", VENCIDA: "Vencida", SUSPENDIDO: "Suspendido" } as const;
export const PROPOSAL_LABEL = {
  BORRADOR: "Borrador",
  ENVIADA: "Enviada",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
} as const;
export const ASSET_LABEL = { DOMINIO: "Dominio", HOSTING: "Hosting", SERVIDOR: "Servidor" } as const;
export const PAYMENT_METHODS = ["Transferencia", "Efectivo", "Mercado Pago", "Otro"] as const;

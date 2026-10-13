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
  PENDIENTE: "bg-amber-100 text-amber-800",
  PAGADO: "bg-green-100 text-green-800",
  VENCIDO: "bg-red-100 text-red-800",
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

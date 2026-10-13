# Grupo Naro — Panel interno y portal de clientes: especificación de diseño

Fecha: 2026-10-13 · Estado: pendiente de revisión

## 1. Propósito

Panel interno (ERP/CRM a medida) para que Grupo Naro controle clientes, propuestas, proyectos de software, plan de cobros e infraestructura (dominios/hosting), más un portal externo de solo lectura donde cada cliente ve el estado de su proyecto y sus pagos mediante un enlace con token.

**Éxito:** cuotas, saldos, MRR y alertas siempre correctos; cada cobro se registra a mano en pocos clics; el cliente ve su estado sin login.

**Fuera de alcance (v1):** integración con Mercado Pago (se gestiona fuera del sistema), emails/notificaciones, multimoneda, cron jobs, registro público de usuarios.

## 2. Stack y decisiones

- Next.js 16.4 (App Router, TypeScript), Tailwind 4, shadcn/ui. **Antes de escribir código leer `node_modules/next/dist/docs/`** (AGENTS.md: esta versión tiene cambios incompatibles).
- PostgreSQL local, en la **misma máquina** que la app (VPS casero). Acceso por `localhost`, puerto no expuesto.
- Prisma ORM. Dinero en `Decimal(14,2)`, moneda ARS implícita.
- Auth.js con credenciales; solo administradores, creados por script de seed.
- Exposición: Cloudflare Tunnel (`cloudflared` → `localhost:3000`).
- Arquitectura: monolito con Server Actions (mutaciones) y Server Components (lecturas).

## 3. Estructura

```
src/
  app/
    (admin)/  dashboard, clients, proposals, projects/[id], infrastructure
    client/view/[token]/   público, solo lectura, noindex
    login/
  domain/    lógica pura (sin Prisma ni Next), con tests
    installments.ts  generación de cuotas y redondeo
    status.ts        VENCIDO, saldo, totales
    metrics.ts       MRR, real vs proyectado
  server/    casos de uso + acceso a datos
  lib/       auth, prisma client, tokens
prisma/schema.prisma
```

## 4. Reglas de negocio

### Pago Único
- Anticipo = 50% del total, obligatorio para iniciar desarrollo.
- 50% restante en 2 o 3 cuotas; el resto del redondeo va a la última cuota (la suma es exacta).
- Todos los montos y vencimientos son editables mientras la cuota esté pendiente.
- Al registrar pagado el anticipo, se ofrece (con confirmación) pasar el proyecto a `EN_DESARROLLO`.
- Código, dominio y hosting son del cliente (`codeOwner = CLIENTE`).

### Suscripción
- **Sin cálculo automático del recargo.** Se cargan a mano `monthlyFee` (ej. $400.000) y `firstPaymentAmount` (ej. $600.000, o el monto que se decida).
- Se generan 6 cuotas: primer pago + 5 mensuales. Si quedan menos de 2 pendientes, se ofrece generar 6 más.
- Ajuste por inflación: editar una cuota pendiente, o "actualizar abono desde el mes N" (reescribe las pendientes desde esa fecha y actualiza `monthlyFee`). Las cuotas pagadas nunca cambian.
- Estado del servicio (`serviceStatus`): `ACTIVO`, `VENCIDA` (derivado cuando hay una cuota mensual vencida), `SUSPENDIDO` (solo manual).
- Código, dominio e infraestructura son de Grupo Naro (`codeOwner = NARO`).

### Mantenimiento mensual en Pago Único
- Opcional por proyecto. Al pasar a `ENTREGADO` se ofrece activarlo con abono y fecha de primer cobro editables; al activarlo, el proyecto pasa a `EN_MANTENIMIENTO`.
- Plan separado (`kind = MANTENIMIENTO`) del plan de desarrollo: el saldo de desarrollo no se mezcla con el mantenimiento.
- Misma mecánica que la suscripción: 6 cuotas, regeneración, ajuste por inflación.
- Se puede pausar o dar de baja (`maintenanceEndedAt`): deja de generar cuotas y las pendientes futuras se anulan tras confirmación.
- No usa `serviceStatus` (el código es del cliente); solo cuotas `PENDIENTE`/`PAGADO`/`VENCIDO`.

### Cobros (todos manuales)
- Cada cuota tiene "Registrar pago": fecha, monto, método, nota/comprobante. Crea un `Payment`.
- Una cuota está `PAGADO` cuando la suma de sus pagos cubre su monto (soporta pagos parciales). Eliminar un pago recalcula.
- `VENCIDO` se **deriva al leer** (`dueDate < hoy` y no pagada); no se guarda y no requiere cron.
- Saldo = suma de cuotas − suma de pagos. No se guarda duplicado.

### Métricas
- **MRR** = `monthlyFee` de suscripciones con `serviceStatus = ACTIVO` + abono de mantenimientos activos (línea aparte por origen).
- **Real** = suma de `Payment` del período. **Proyectado** = suma de cuotas con vencimiento en el período.

## 5. Modelo de datos

| Entidad | Campos clave |
|---|---|
| `AdminUser` | email (único), passwordHash, name |
| `Client` | name, contactName, email, phone, taxId, notes |
| `Proposal` | clientId, title, scope, oneTimePrice, monthlyFee, status (`BORRADOR`/`ENVIADA`/`ACEPTADA`/`RECHAZADA`), acceptedModel?, validUntil? |
| `Project` | clientId, proposalId?, name, stage (`COTIZACION`/`EN_DESARROLLO`/`ENTREGADO`/`EN_MANTENIMIENTO`), contractType (`PAGO_UNICO`/`SUSCRIPCION`), totalAmount?, monthlyFee?, firstPaymentAmount?, serviceSuspended (boolean; `serviceStatus` ACTIVO/VENCIDA/SUSPENDIDO se deriva al leer), codeOwner (`CLIENTE`/`NARO`), maintenanceFee?, maintenanceStartsAt?, maintenanceEndedAt?, startedAt?, deliveredAt? |
| `InstallmentPlan` | projectId, kind (`DESARROLLO`/`SUSCRIPCION`/`MANTENIMIENTO`), totalAmount?, installmentCount?; un proyecto puede tener más de un plan |
| `Installment` | planId, type (`ANTICIPO`/`CUOTA`/`PRIMER_PAGO`/`MENSUAL`/`MANTENIMIENTO`), sequence, amount, dueDate, status (`PENDIENTE`/`PAGADO`; `VENCIDO` derivado) |
| `Payment` | installmentId, amount, paidAt, method, receiptNote, receiptUrl? |
| `InfrastructureAsset` | projectId, type (`DOMINIO`/`HOSTING`/`SERVIDOR`), provider, identifier, renewalDate, managedByNaro, costAmount? |
| `ClientAccessToken` | projectId, tokenHash (único), createdAt, expiresAt?, revokedAt?, lastViewedAt? |

Índices: `Installment(dueDate, status)`, `InfrastructureAsset(renewalDate)`, `ClientAccessToken(tokenHash)`.

## 6. Portal del cliente — `/client/view/[token]`

- Solo lectura, sin login. Muestra: etapa del proyecto, total abonado, saldo pendiente, historial de pagos, cuotas pendientes con vencimiento. Desarrollo y mantenimiento se muestran por separado.
- Los datos se proyectan a un DTO explícito: nunca se devuelve el objeto Prisma crudo; sin notas internas, comprobantes ni otros proyectos.
- Token aleatorio de 32 bytes, se muestra una sola vez al generarlo; se guarda solo su hash. Revocable y regenerable, vencimiento opcional.
- `noindex`, límite de intentos por IP, 404 genérico ante token inválido o revocado.

## 7. Dashboard y alertas (admin)

- Ingresos reales vs proyectados, MRR (suscripciones / mantenimiento).
- Alertas: cuotas vencidas y por vencer (7 días); renovaciones de dominio/hosting gestionados por Naro (30 días). Calculadas al leer.

## 8. Seguridad y despliegue

- Middleware protege `(admin)`; cada Server Action revalida la sesión.
- Build `output: standalone`, servicio gestionado (pm2/NSSM/systemd), `cloudflared` ingress a `localhost:3000`.
- Variables: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`.
- Respaldo diario con `pg_dump` (una única base para dev y prod).

## 9. Pruebas

- Vitest sobre `domain/`: generación de cuotas, redondeo, ajuste por inflación, saldo, `VENCIDO`, MRR.
- Verificación manual por etapa de las rutas críticas (login, portal con token).

## 10. Etapas

1. Base: Prisma, Postgres, Auth.js, shadcn, layout.
2. Clientes y propuestas.
3. Proyectos y pipeline.
4. Cuotas, pagos y mantenimiento (núcleo).
5. Infraestructura y alertas.
6. Dashboard.
7. Portal del cliente.
8. Despliegue (VPS, Cloudflare Tunnel, respaldo).

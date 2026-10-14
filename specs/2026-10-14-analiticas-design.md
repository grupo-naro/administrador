# Analíticas del negocio — especificación de diseño

Fecha: 2026-10-14 · Estado: pendiente de revisión · Complementa [2026-10-13-grupo-naro-design.md](2026-10-13-grupo-naro-design.md)

## 1. Propósito

Una sección **Analíticas** en el panel con las estadísticas del negocio lo más completas posible, para decidir con datos: cuánto entra y cuánto se proyecta, cómo se cobra, cuánto pesa lo recurrente, cómo van las ventas, cómo está la cartera de proyectos y clientes y cuánto cuesta la infraestructura.

**Éxito:** cada cifra coincide con lo que se obtiene sumando a mano los pagos y las cuotas de la base; las comparaciones contra el período anterior son claras; lo que no tiene datos no ocupa lugar.

**Fuera de alcance (v1):** exportar a CSV o PDF, filtros por cliente, gráficos interactivos, historial exacto de MRR, gastos generales del negocio (solo se descuenta la infraestructura), alertas automáticas.

## 2. Estructura de la pantalla

- Ruta `/analytics` (grupo `(admin)`, protegida como el resto del panel). Entrada **Analíticas** en la barra lateral.
- Parámetros en la URL: `periodo` = `semana` | `mes` | `6m` | `1a` (por defecto `mes`) y `seccion` = `finanzas` | `cobranza` | `recurrente` | `ventas` | `proyectos` | `infra` (por defecto `finanzas`). Los cambios son enlaces, sin JavaScript de cliente.
- El selector de período se muestra en todas las pestañas. Las métricas que no dependen del período (por ejemplo la deuda actual) lo indican con la etiqueta "Hoy".
- Partes opcionales (suscripciones, mantenimiento, etc.) se ocultan cuando no hay datos.

## 3. Períodos y comparación

Zona horaria de negocio: America/Argentina/Buenos_Aires ("hoy" = `todayAR()`). Los rangos son `[desde, hasta)` en fechas UTC medianoche, como el resto del sistema.

| Período | Rango actual | Anterior |
|---|---|---|
| Semana | lunes a domingo de la semana de hoy | la semana anterior completa |
| Mes | del día 1 al último día del mes en curso | el mes anterior completo |
| 6 meses | desde el día 1 de hace 5 meses hasta el fin del mes en curso (6 meses calendario) | los 6 meses calendario anteriores |
| 1 año | desde el día 1 de hace 11 meses hasta el fin del mes en curso (12 meses calendario) | los 12 meses calendario anteriores |

- El período en curso incluye días futuros; las cifras de "cobrado" de esos días son cero. La comparación es siempre contra el período anterior **completo** y la pantalla lo avisa ("período en curso").
- Variación = `actual − anterior` en monto y `(actual − anterior) / anterior` en porcentaje; si el anterior es 0 se muestra solo el monto (sin porcentaje).

## 4. Definiciones de métricas

Todo el dinero se calcula en **centavos enteros**. "Cuota" = `Installment`; "pagado de una cuota" = suma de sus `Payment`; "saldo de una cuota" = `max(0, monto − pagado)`.

### 4.1 Finanzas (dependen del período)
- **Cobrado** = Σ `Payment.amount` con `paidAt` dentro del rango, sin importar de qué cuota vengan.
- **Proyectado** = Σ monto de las cuotas con `dueDate` dentro del rango.
- **Cumplimiento** = Σ `min(pagado, monto)` (pagos de cualquier fecha) de las cuotas que vencían en el rango ÷ Proyectado. Sin valor si Proyectado es 0.
- **Por cobrar del período** = Σ saldo de las cuotas del rango con `dueDate ≥ hoy`. **Vencido del período** = Σ saldo de las cuotas del rango con `dueDate < hoy`.
- **Costos de infraestructura** = para cada activo con `managedByNaro` y `costAmount` cargado: `costAmount ÷ (costEveryMonths × 30,4375)` por día × días del rango (redondeado a centavos por activo); se suman. Es una aproximación: se asume que el activo existe todo el período.
- **Balance neto** = Cobrado − Costos de infraestructura.
- **Por origen**: Cobrado agrupado por el tipo de plan de la cuota (`DESARROLLO` = proyectos únicos, `SUSCRIPCION`, `MANTENIMIENTO`). **Por método**: Cobrado agrupado por `Payment.method`.
- **Serie**: tramos de un día (semana y mes) o de un mes calendario (6 meses y 1 año); cada tramo con Cobrado, Proyectado, Costos y Neto, usando las mismas definiciones restringidas al tramo.
- **Top 5 clientes y proyectos** por Cobrado del rango, con el porcentaje del total; **concentración** = porcentaje del Cobrado que aportan los 3 primeros clientes.

### 4.2 Cobranza
- **Antigüedad de lo vencido** (hoy): cuotas con saldo > 0 y `dueDate < hoy`, en tramos por días de atraso: 1–7, 8–30, 31–60 y más de 60; para cada tramo, cantidad de cuotas y suma de saldos.
- **Puntualidad** (período): cuotas totalmente pagadas cuyo último pago cae en el rango. A tiempo = fecha del último pago ≤ `dueDate`. Se muestra % a tiempo y demora promedio en días (solo de las que pagaron tarde). Sin valor si no hay cuotas.
- **Saldo pendiente total** (hoy) = Σ saldo de todas las cuotas (incluye las cuotas futuras ya generadas; se muestra dividido en vencido + por vencer); **vence en los próximos 30 días** = Σ saldo de las cuotas con `dueDate` entre hoy y hoy + 30.
- **Clientes con deuda vencida** (hoy): por cliente, saldo vencido, cantidad de cuotas y días de atraso de la más antigua; ordenados por saldo.

### 4.3 Recurrente
- **MRR** = definición del dashboard (abono de suscripciones con estado `ACTIVO` + abono de mantenimientos activos); **ARR** = MRR × 12; desglose por origen.
- **Contratos**: suscripciones activas / vencidas / suspendidas, mantenimientos activos. **Ingreso promedio por contrato activo** = MRR ÷ contratos activos.
- **Altas del período**: planes `SUSCRIPCION` o `MANTENIMIENTO` creados en el rango (`InstallmentPlan.createdAt`). **Bajas del período**: proyectos con `maintenanceEndedAt` en el rango. **Suspendidas actuales**: proyectos con `serviceSuspended` (no tienen fecha, por eso no se ubican en el tiempo).
- **Ingreso recurrente cobrado por mes** (últimos 12 meses calendario, independiente del período elegido): Cobrado en planes de suscripción y mantenimiento.

### 4.4 Ventas (por fecha de creación de la propuesta, salvo que se indique)
- **Propuestas creadas** en el rango y su estado actual (borrador, enviada, aceptada, rechazada).
- **Conversión** = aceptadas ÷ creadas del período (cohorte); además, **sobre decididas** = aceptadas ÷ (aceptadas + rechazadas).
- **Valor propuesto** = Σ `oneTimePrice` de las creadas. **Valor aceptado** = Σ `totalAmount` de los proyectos únicos nacidos de propuestas aceptadas con proyecto creado en el rango, más el abono mensual sumado de las suscripciones aceptadas (se muestra aparte).
- **Días hasta el cierre** = promedio de (`Project.createdAt` − `Proposal.createdAt`) de las aceptadas con proyecto creado en el rango. La fecha de aceptación es la del proyecto que se crea al aceptar.
- **Mix de modelos** (aceptadas con proyecto en el rango): cantidad Pago Único vs. Suscripción. **Ticket promedio** = promedio de `totalAmount` de los proyectos únicos aceptados.
- **Pipeline abierto** (hoy): propuestas en borrador o enviadas, cantidad y Σ `oneTimePrice`; cuántas ya pasaron su `validUntil`.

### 4.5 Proyectos y clientes
- **Proyectos por etapa** (hoy): cantidad por etapa, contratado total de los únicos y abono mensual de los recurrentes.
- **Del período**: proyectos nuevos (`createdAt`), entregados (`deliveredAt`) y **duración promedio del desarrollo** (`startedAt` → `deliveredAt`) de los entregados en el rango; sin valor si no hay.
- **Clientes**: total, nuevos del período (`createdAt`), con algún proyecto en desarrollo, en mantenimiento o con suscripción activa, y **cobrado acumulado histórico** por cliente (top 10).

### 4.6 Infraestructura (hoy)
- **Costo mensual equivalente** = Σ `costAmount ÷ costEveryMonths` de los activos `managedByNaro` con costo.
- **Activos por tipo** (dominio, hosting, servidor), separando gestionados por Naro y por el cliente.
- **Renovaciones**: vencidas y las que vencen en 30, 60 y 90 días, con cantidad y costo (el costo de la renovación es `costAmount`).

## 5. Modelo de datos

Una única migración: `InfrastructureAsset.costEveryMonths Int @default(12)` (valores permitidos 1, 3, 6, 12). Los activos existentes quedan en 12 hasta que se vuelvan a cargar. El formulario de alta de activos suma el campo "Se paga cada" y la lista de activos lo muestra. No se agregan otras tablas.

## 6. Arquitectura

```
src/domain/analytics/        # PURO: sin Prisma ni Next, con tests al lado
  period.ts       rangos, período anterior, tramos, variación
  finance.ts      cobrado, proyectado, cumplimiento, costos, neto, series, top
  collections.ts  antigüedad, puntualidad, deuda, clientes con deuda
  recurring.ts    MRR/ARR, contratos, altas/bajas, serie recurrente
  sales.ts        propuestas, conversión, valores, mix, pipeline
  portfolio.ts    proyectos por etapa, del período, clientes
  infra.ts        costo mensual, activos por tipo, renovaciones
src/server/analytics/queries.ts   # carga los datos (server-only), mapea a centavos y llama al dominio
src/components/analytics/         # tarjetas, barras SVG, tablas, selector (server components)
src/app/(admin)/analytics/page.tsx
```

- Una sola carga de datos por visita (cuotas con pagos, proyectos, propuestas, clientes, activos) y todo se calcula en memoria. Es adecuado para el volumen actual; si creciera, se agregarían filtros de fecha en las consultas.
- Gráficos de barras como componentes SVG propios, sin librerías, con colores de la marca (cobrado en azul `#1E56F0`, proyectado en azul claro `#B6C9FB`), texto alternativo y la misma información en la tabla de debajo.
- La pantalla usa `await connection()` y `export const instant = false`, como el dashboard.

## 7. Pruebas

- Tests unitarios (Vitest) de cada función pura con fechas fijas: cambios de semana y de mes, años no bisiestos y bisiestos, períodos vacíos, cuotas con pagos parciales, pagos fuera de rango, divisiones por cero y redondeo de costos.
- Verificación funcional contra la base real con un script que calcula cada cifra de forma independiente (consultas directas) y la compara con lo que muestra la pantalla, con datos de prueba etiquetados que se borran al terminar.
- `typecheck`, `lint`, `build` y toda la suite deben pasar.

## 8. Limitaciones conocidas

- No hay historial de estados: "nuevos" se mide por fecha de alta y la fecha de aceptación es la del proyecto.
- El MRR histórico exacto no se puede reconstruir; se muestra el ingreso recurrente cobrado por mes.
- Las suscripciones suspendidas no tienen fecha de suspensión.
- Los costos de infraestructura son aproximados (no se sabe desde cuándo existe cada activo).
- Los períodos en curso se comparan contra el período anterior completo.

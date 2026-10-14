# Analíticas del negocio — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar la sección **Analíticas** al panel de Grupo Naro con seis pestañas (Finanzas, Cobranza, Recurrente, Ventas, Proyectos y clientes, Infraestructura) y un selector de período (semana, mes, 6 meses, 1 año) comparado contra el período anterior.

**Architecture:** Toda la lógica de métricas vive en funciones puras en `src/domain/analytics/` (centavos enteros, sin Prisma ni Next, con tests). `src/server/analytics/queries.ts` carga los datos una vez por visita y los mapea a "hechos" (`Facts`); `src/domain/analytics/build.ts` compone las funciones puras por pestaña; la pantalla (`/analytics`) es de solo lectura, con componentes de servidor y gráficos SVG propios (sin librerías nuevas).

**Tech Stack:** Next.js 16.4 (App Router, `cacheComponents`), TypeScript, Tailwind 4, Prisma 6 + PostgreSQL, Vitest. Sin dependencias nuevas.

**Spec:** [specs/2026-10-14-analiticas-design.md](specs/2026-10-14-analiticas-design.md) (las fórmulas exactas de cada métrica están en su §4; este plan las implementa tal cual).

## Global Constraints

- **Antes de escribir código de Next, leer `node_modules/next/dist/docs/`** (AGENTS.md: esta versión rompe con lo conocido). Ya verificado en este proyecto: `middleware` se llama `src/proxy.ts`; `params` y `searchParams` son `Promise`; con `cacheComponents: true` toda ruta que lee base de datos o la hora declara `export const instant = false` y usa `await connection()` (patrón de `src/app/(admin)/dashboard/page.tsx`).
- Dinero en **centavos enteros** en todo el dominio; en la base `Decimal(14,2)`; las conversiones solo con `decToCents`/`centsToDec` de `src/server/mappers.ts`.
- Zona horaria de negocio **America/Argentina/Buenos_Aires**: "hoy" es siempre `todayAR()`; las fechas de cuotas y pagos son `@db.Date` tratadas como UTC medianoche. Todos los rangos son `[desde, hasta)`.
- Períodos (spec §3): semana = lunes a domingo; mes = mes calendario; 6 meses / 1 año = 6 / 12 meses calendario terminando con el mes en curso; el anterior es siempre el período equivalente inmediatamente previo y **completo**.
- Costo de infraestructura: `costAmount ÷ (costEveryMonths × 30,4375)` por día × días del rango; solo activos con `managedByNaro` y costo cargado; `costEveryMonths` ∈ {1, 3, 6, 12}, por defecto 12.
- Seguridad: la pantalla es solo para administradores (el proxy y el layout `(admin)` ya protegen todo); no se expone nada al portal del cliente. Las consultas son `server-only`.
- Idioma de la interfaz y de los mensajes: **español rioplatense**. Sin dependencias nuevas (los gráficos son SVG propios con la paleta de la marca: azul `#1E56F0`, azul claro `#B6C9FB`, tinta `#1C2737`).
- Los componentes shadcn son del preset `@base-ui` (el `Button` no tiene `asChild`).

## Review Focus

Entradas que la spec implica y que ningún caso obvio cubre; cada una tiene su test en la tarea indicada:

1. **Período sin datos** (sin pagos, cuotas, propuestas ni contratos): todo da 0 o `null` (nunca `NaN`/`Infinity`/"undefined" en pantalla) y las partes opcionales se ocultan (Tasks 3–7 y 12).
2. **Fechas en el borde del rango**: un pago o vencimiento el día `desde` entra y el día `hasta` no; semanas que cruzan meses y años; febrero bisiesto (Tasks 2 y 3).
3. **Pagos de cuotas de otros meses y pagos parciales**: "cobrado" cuenta el pago por su fecha aunque la cuota sea de otro mes; "cumplimiento" usa `min(pagado, monto)` de las cuotas del período (Task 3).
4. **Costos mal cargados**: activos sin costo, no gestionados por Naro o con `costEveryMonths` inválido (0, negativo, `NaN`) no suman ni rompen el cálculo (Task 3).
5. **Balance negativo** (costos mayores que lo cobrado): se muestra con signo y color de alerta, sin romper el formato (Tasks 2 y 9).

---

## Estructura de archivos

```
prisma/schema.prisma                         + InfrastructureAsset.costEveryMonths
prisma/migrations/*_infra_costo_periodicidad
src/domain/analytics/
  common.ts period.ts finance.ts collections.ts recurring.ts
  sales.ts portfolio.ts infra.ts facts.ts build.ts      (+ *.test.ts al lado)
src/lib/format.ts (+ format.test.ts)
src/server/analytics/queries.ts
src/components/analytics/
  sections.ts kpi.tsx block.tsx simple-table.tsx bar-chart.tsx selectors.tsx
  finance-section.tsx collections-section.tsx recurring-section.tsx
  sales-section.tsx portfolio-section.tsx infra-section.tsx
src/app/(admin)/analytics/page.tsx
src/components/admin-nav.tsx                 + entrada "Analíticas"
src/server/infrastructure/actions.ts, src/components/project/infra-section.tsx,
src/app/(admin)/projects/[id]/page.tsx, src/app/(admin)/infrastructure/page.tsx   (campo "Se paga cada")
```

---

### Task 1: Campo "Se paga cada" en Infraestructura (migración)

**Files:**
- Modify: `prisma/schema.prisma` (modelo `InfrastructureAsset`)
- Create: `prisma/migrations/<timestamp>_infra_costo_periodicidad/migration.sql` (la genera Prisma)
- Modify: `src/server/infrastructure/actions.ts`
- Modify: `src/components/project/infra-section.tsx`
- Modify: `src/app/(admin)/projects/[id]/page.tsx` (la línea que monta `<InfraSection …>`)
- Modify: `src/app/(admin)/infrastructure/page.tsx`

**Interfaces:**
- Produces: columna `InfrastructureAsset.costEveryMonths Int @default(12)` (Prisma: `costEveryMonths: number`); el alta de activos recibe el campo de formulario `costEveryMonths` ∈ `"1" | "3" | "6" | "12"`; `InfraSection` pasa a recibir por activo `costCents: number | null` y `costEveryMonths: number`.

- [ ] **Step 1: Agregar el campo al esquema**

En `prisma/schema.prisma`, dentro de `model InfrastructureAsset`, justo debajo de `costAmount`:

```prisma
  costAmount      Decimal?  @db.Decimal(14, 2)
  costEveryMonths Int       @default(12)
```

(Conservar la alineación del resto del modelo; el nombre de la migración es lo que importa.)

- [ ] **Step 2: Generar y aplicar la migración**

Antes de correr nada, comprobar si hay un `next dev` del usuario en el puerto 3000 (`netstat -ano | findstr :3000`). **No lo detengas.** En Windows ese servidor bloquea la regeneración del motor de Prisma, y es esperable un error `EPERM … query_engine-windows.dll.node` al final del comando.

Run: `pnpm exec prisma migrate dev --name infra_costo_periodicidad`
Expected: la migración se crea y se aplica (`Your database is now in sync with your schema`). Si después aparece `EPERM` al generar el cliente, es el bloqueo descrito: el SQL ya se aplicó y los tipos (`index.d.ts`) e `index.js` se actualizan antes de ese error. Verificar:

Run: `grep -c "costEveryMonths" node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/index.d.ts`
Expected: un número mayor que 0. Si es 0, reportar BLOCKED con el detalle (no matar ningún proceso del usuario).

El SQL generado debe ser exactamente:

```sql
-- AlterTable
ALTER TABLE "InfrastructureAsset" ADD COLUMN     "costEveryMonths" INTEGER NOT NULL DEFAULT 12;
```

- [ ] **Step 3: Aceptar el campo en el alta de activos**

En `src/server/infrastructure/actions.ts`, agregar al `schema` (después de `cost: optMoney,`):

```ts
  costEveryMonths: z.enum(["1", "3", "6", "12"]),
```

y cambiar la desestructuración y el `create`:

```ts
  const { managedByNaro, cost, costEveryMonths, ...rest } = parsed.data;
  await prisma.infrastructureAsset.create({
    data: {
      ...rest,
      projectId,
      managedByNaro: managedByNaro === "true",
      costAmount: cost ? centsToDec(cost) : undefined,
      costEveryMonths: Number(costEveryMonths),
    },
  });
```

- [ ] **Step 4: Formulario y lista en la ficha del proyecto**

En `src/components/project/infra-section.tsx`:

1. Ampliar el tipo de los activos con `costCents: number | null; costEveryMonths: number;` e importar `formatARS` de `@/domain/money`.
2. En cada fila, después del texto existente, mostrar el costo cuando existe: `{a.costCents ? ` · ${formatARS(a.costCents)} ${a.costEveryMonths === 1 ? "por mes" : `cada ${a.costEveryMonths} meses`}` : ""}`.
3. En el formulario de alta, justo debajo del campo "Costo (ARS, opcional)":

```tsx
          <SelectField
            label="Se paga cada"
            name="costEveryMonths"
            defaultValue="12"
            options={[
              { value: "1", label: "1 mes" },
              { value: "3", label: "3 meses" },
              { value: "6", label: "6 meses" },
              { value: "12", label: "12 meses (anual)" },
            ]}
          />
```

En `src/app/(admin)/projects/[id]/page.tsx`, importar `decToCents` de `@/server/mappers` y reemplazar el montaje por:

```tsx
      <InfraSection
        projectId={project.id}
        assets={project.assets.map((a) => ({
          id: a.id,
          type: a.type,
          provider: a.provider,
          identifier: a.identifier,
          renewalDate: a.renewalDate,
          managedByNaro: a.managedByNaro,
          costCents: a.costAmount ? decToCents(a.costAmount) : null,
          costEveryMonths: a.costEveryMonths,
        }))}
      />
```

- [ ] **Step 5: Mostrar el costo en la lista global**

En `src/app/(admin)/infrastructure/page.tsx`, importar `formatARS` y `decToCents`, y al lado de la fecha de renovación mostrar `a.costAmount ? ` · ${formatARS(decToCents(a.costAmount))} ${a.costEveryMonths === 1 ? "por mes" : `cada ${a.costEveryMonths} meses`}` : ""` (mismo criterio de texto que en el Step 4).

- [ ] **Step 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: todo pasa, sin advertencias.

Verificación funcional contra la base real (producción local: `pnpm start` en un puerto libre, login con cookie jar o Playwright con `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; leer `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `.env` sin imprimirlos; nunca imprimir secretos; **no** tocar el servidor `next dev` del usuario en el puerto 3000):
1. Crear un cliente y un proyecto de prueba (tag `DEMOUI6`) por Prisma; desde la ficha del proyecto agregar un activo `HOSTING`, gestionado por Naro, costo 5000, "Se paga cada" = 3 meses → en la base `costEveryMonths = 3`, `costAmount = 5000.00`, y la ficha muestra "cada 3 meses".
2. Agregar otro activo sin tocar el selector → `costEveryMonths = 12`.
3. Forzar un valor inválido (editar el `<option>` del navegador a `5`) → el servidor rechaza el alta y no crea la fila.
4. Borrar todos los datos de prueba y detener el servidor que hayas levantado.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/server/infrastructure/actions.ts src/components/project/infra-section.tsx "src/app/(admin)/projects/[id]/page.tsx" "src/app/(admin)/infrastructure/page.tsx"
git commit -m "feat: periodicidad del costo de infraestructura (se paga cada N meses)"
```

---

### Task 2: Períodos, variación y formato (TDD)

**Files:**
- Create: `src/domain/analytics/common.ts`, `src/domain/analytics/period.ts`, `src/lib/format.ts`
- Test: `src/domain/analytics/period.test.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: `addMonths`, `formatDate`, `parseDateInput`, `toDateInput` de `src/domain/dates.ts`; `formatARS` de `src/domain/money.ts`.
- Produces:

```ts
// common.ts
export type PlanKind = "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO";
export const DAY_MS: number;
export const inRange: (d: Date, from: Date, to: Date) => boolean;      // [from, to)
export const daysBetween: (from: Date, to: Date) => number;
// period.ts
export type PeriodKey = "semana" | "mes" | "6m" | "1a";
export const PERIOD_KEYS: PeriodKey[]; export const PERIOD_LABEL: Record<PeriodKey, string>;
export interface Period { key: PeriodKey; from: Date; to: Date; days: number }
export interface Bucket { label: string; from: Date; to: Date; days: number }
export function parsePeriodKey(value: string | undefined): PeriodKey;       // por defecto "mes"
export function resolvePeriod(key: PeriodKey, today: Date): { current: Period; previous: Period };
export function bucketsOf(p: Period): Bucket[];                            // días (semana, mes) o meses (6m, 1a)
export function periodRangeLabel(p: Period): string;                       // "12/10/2026 al 18/10/2026"
export function variation(current: number, previous: number): { diffCents: number; pct: number | null };
// format.ts
export function formatPct(fraction: number | null, maxDigits?: number): string;   // "53,3 %" | "—"
export function formatSignedPct(fraction: number): string;
export function formatSignedARS(cents: number): string;                    // "+$ 500,00" | "−$ 500,00"
export function formatCompactARS(cents: number): string;
export function formatDays(days: number | null): string;                   // "2,3 días" | "1 día" | "—"
```

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/analytics/period.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d, toDateInput as iso } from "../dates";
import { bucketsOf, parsePeriodKey, periodRangeLabel, resolvePeriod, variation } from "./period";

const today = d("2026-10-14"); // miércoles

describe("parsePeriodKey", () => {
  it("usa 'mes' por defecto y ante valores inválidos", () => {
    expect(parsePeriodKey(undefined)).toBe("mes");
    expect(parsePeriodKey("foo")).toBe("mes");
    expect(parsePeriodKey("6m")).toBe("6m");
    expect(parsePeriodKey("semana")).toBe("semana");
  });
});

describe("resolvePeriod", () => {
  it("semana: de lunes a domingo, con la anterior completa", () => {
    const { current, previous } = resolvePeriod("semana", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2026-10-12", "2026-10-19", 7]);
    expect([iso(previous.from), iso(previous.to), previous.days]).toEqual(["2026-10-05", "2026-10-12", 7]);
  });

  it("semana: hoy lunes y hoy domingo caen en la misma semana", () => {
    expect(iso(resolvePeriod("semana", d("2026-10-12")).current.from)).toBe("2026-10-12");
    expect(iso(resolvePeriod("semana", d("2026-10-18")).current.from)).toBe("2026-10-12");
    expect(iso(resolvePeriod("semana", d("2026-10-19")).current.from)).toBe("2026-10-19");
  });

  it("semana que cruza el fin de año", () => {
    const { current } = resolvePeriod("semana", d("2027-01-01")); // viernes
    expect([iso(current.from), iso(current.to)]).toEqual(["2026-12-28", "2027-01-04"]);
  });

  it("mes: mes calendario y el anterior completo", () => {
    const { current, previous } = resolvePeriod("mes", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2026-10-01", "2026-11-01", 31]);
    expect([iso(previous.from), iso(previous.to), previous.days]).toEqual(["2026-09-01", "2026-10-01", 30]);
  });

  it("mes: cruce de año y febrero bisiesto", () => {
    const jan = resolvePeriod("mes", d("2027-01-05"));
    expect([iso(jan.current.from), iso(jan.previous.from)]).toEqual(["2027-01-01", "2026-12-01"]);
    const feb = resolvePeriod("mes", d("2028-02-10"));
    expect([feb.current.days, feb.previous.days]).toEqual([29, 31]);
  });

  it("6 meses: 6 meses calendario terminando con el actual", () => {
    const { current, previous } = resolvePeriod("6m", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2026-05-01", "2026-11-01", 184]);
    expect([iso(previous.from), iso(previous.to), previous.days]).toEqual(["2025-11-01", "2026-05-01", 181]);
    expect(iso(resolvePeriod("6m", d("2027-01-05")).current.from)).toBe("2026-08-01");
  });

  it("1 año: 12 meses calendario terminando con el actual", () => {
    const { current, previous } = resolvePeriod("1a", today);
    expect([iso(current.from), iso(current.to), current.days]).toEqual(["2025-11-01", "2026-11-01", 365]);
    expect([iso(previous.from), iso(previous.to)]).toEqual(["2024-11-01", "2025-11-01"]);
  });
});

describe("bucketsOf", () => {
  it("mes: un tramo por día", () => {
    const b = bucketsOf(resolvePeriod("mes", today).current);
    expect(b).toHaveLength(31);
    expect(b[0].label).toBe("1");
    expect(b[30].label).toBe("31");
    expect(iso(b[30].to)).toBe("2026-11-01");
    expect(b.every((x) => x.days === 1)).toBe(true);
  });

  it("semana: 7 tramos de lunes a domingo", () => {
    const b = bucketsOf(resolvePeriod("semana", today).current);
    expect(b).toHaveLength(7);
    expect(iso(b[0].from)).toBe("2026-10-12");
    expect(iso(b[6].to)).toBe("2026-10-19");
  });

  it("6 meses y 1 año: un tramo por mes calendario que cubre el período sin huecos", () => {
    const six = bucketsOf(resolvePeriod("6m", today).current);
    expect(six).toHaveLength(6);
    expect(iso(six[0].from)).toBe("2026-05-01");
    expect(six[0].days).toBe(31);
    expect(iso(six[5].to)).toBe("2026-11-01");
    expect(six.reduce((s, x) => s + x.days, 0)).toBe(184);
    expect(six[5].label).toMatch(/oct/i);
    six.slice(1).forEach((x, i) => expect(x.from.getTime()).toBe(six[i].to.getTime()));
    expect(bucketsOf(resolvePeriod("1a", today).current)).toHaveLength(12);
  });
});

describe("periodRangeLabel", () => {
  it("muestra desde y el último día incluido", () => {
    expect(periodRangeLabel(resolvePeriod("semana", today).current)).toBe("12/10/2026 al 18/10/2026");
    expect(periodRangeLabel(resolvePeriod("mes", today).current)).toBe("01/10/2026 al 31/10/2026");
  });
});

describe("variation", () => {
  it("diferencia y porcentaje (fracción) contra el período anterior", () => {
    expect(variation(150, 100)).toEqual({ diffCents: 50, pct: 0.5 });
    expect(variation(50, 100)).toEqual({ diffCents: -50, pct: -0.5 });
  });

  it("sin porcentaje cuando el anterior es 0", () => {
    expect(variation(10, 0)).toEqual({ diffCents: 10, pct: null });
    expect(variation(0, 0)).toEqual({ diffCents: 0, pct: null });
  });

  it("usa el valor absoluto del anterior (anterior negativo)", () => {
    expect(variation(-50, -100)).toEqual({ diffCents: 50, pct: 0.5 });
  });
});
```

`src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatARS } from "@/domain/money";
import { formatCompactARS, formatDays, formatPct, formatSignedARS, formatSignedPct } from "./format";

const norm = (s: string) => s.replace(/\u00a0/g, " ");

describe("formatPct", () => {
  it("formatea fracciones y tolera null / no finitos", () => {
    expect(norm(formatPct(0.5333))).toContain("53,3");
    expect(formatPct(0.5333)).toContain("%");
    expect(formatPct(null)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
    expect(formatPct(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("formatSignedPct agrega + a los positivos", () => {
    expect(formatSignedPct(0.25).startsWith("+")).toBe(true);
    expect(formatSignedPct(-0.25).startsWith("+")).toBe(false);
  });
});

describe("formatSignedARS", () => {
  it("signo explícito y valor 0 sin signo", () => {
    expect(norm(formatSignedARS(5000))).toBe("+$ 50,00");
    expect(norm(formatSignedARS(-5000))).toBe("−$ 50,00");
    expect(norm(formatSignedARS(0))).toBe("$ 0,00");
  });

  it("los negativos grandes (balance en contra) conservan el formato", () => {
    expect(norm(formatARS(-13_500_000))).toContain("135.000,00");
    expect(norm(formatSignedARS(-13_500_000))).toBe("−$ 135.000,00");
  });
});

describe("formatCompactARS y formatDays", () => {
  it("compacta montos para los ejes del gráfico", () => {
    expect(norm(formatCompactARS(0))).toContain("0");
    expect(formatCompactARS(150_000_000).length).toBeLessThan(14);
  });

  it("días con singular y null", () => {
    expect(formatDays(null)).toBe("—");
    expect(formatDays(1)).toBe("1 día");
    expect(formatDays(2.25)).toBe("2,3 días");
    expect(formatDays(0)).toBe("0 días");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/domain/analytics/period.test.ts src/lib/format.test.ts`
Expected: FAIL (`Cannot find module './period'` y `'./format'`).

- [ ] **Step 3: Implementar**

`src/domain/analytics/common.ts`:

```ts
export type PlanKind = "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO";

export const DAY_MS = 86_400_000;

/** `true` si `d` cae en el rango `[from, to)`. */
export const inRange = (d: Date, from: Date, to: Date): boolean =>
  d.getTime() >= from.getTime() && d.getTime() < to.getTime();

/** Días enteros entre dos fechas (UTC medianoche). */
export const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);
```

`src/domain/analytics/period.ts`:

```ts
import { addMonths, formatDate } from "../dates";
import { DAY_MS, daysBetween } from "./common";

export type PeriodKey = "semana" | "mes" | "6m" | "1a";

export const PERIOD_KEYS: PeriodKey[] = ["semana", "mes", "6m", "1a"];

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  semana: "Semana",
  mes: "Mes",
  "6m": "6 meses",
  "1a": "1 año",
};

export interface Period {
  key: PeriodKey;
  from: Date;
  to: Date;
  days: number;
}

export interface Bucket {
  label: string;
  from: Date;
  to: Date;
  days: number;
}

export function parsePeriodKey(value: string | undefined): PeriodKey {
  return PERIOD_KEYS.find((k) => k === value) ?? "mes";
}

const firstOfMonth = (d: Date, offsetMonths = 0) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));

const makePeriod = (key: PeriodKey, from: Date, to: Date): Period => ({ key, from, to, days: daysBetween(from, to) });

/** Período en curso y el inmediatamente anterior (completo), en rangos `[from, to)`. */
export function resolvePeriod(key: PeriodKey, today: Date): { current: Period; previous: Period } {
  switch (key) {
    case "semana": {
      const sinceMonday = (today.getUTCDay() + 6) % 7; // lunes = 0
      const from = new Date(today.getTime() - sinceMonday * DAY_MS);
      const to = new Date(from.getTime() + 7 * DAY_MS);
      return { current: makePeriod(key, from, to), previous: makePeriod(key, new Date(from.getTime() - 7 * DAY_MS), from) };
    }
    case "mes": {
      const from = firstOfMonth(today);
      const to = firstOfMonth(today, 1);
      return { current: makePeriod(key, from, to), previous: makePeriod(key, firstOfMonth(today, -1), from) };
    }
    case "6m":
    case "1a": {
      const months = key === "6m" ? 6 : 12;
      const to = firstOfMonth(today, 1);
      const from = firstOfMonth(today, 1 - months);
      return { current: makePeriod(key, from, to), previous: makePeriod(key, firstOfMonth(today, 1 - 2 * months), from) };
    }
  }
}

const WEEKDAY = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "short", day: "numeric" });
const MONTH = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "short", year: "2-digit" });

/** Tramos para series: un día (semana y mes) o un mes calendario (6 meses y 1 año). */
export function bucketsOf(p: Period): Bucket[] {
  const out: Bucket[] = [];
  if (p.key === "semana" || p.key === "mes") {
    for (let t = p.from.getTime(); t < p.to.getTime(); t += DAY_MS) {
      const from = new Date(t);
      out.push({
        label: p.key === "semana" ? WEEKDAY.format(from) : String(from.getUTCDate()),
        from,
        to: new Date(t + DAY_MS),
        days: 1,
      });
    }
    return out;
  }
  let from = p.from;
  while (from.getTime() < p.to.getTime()) {
    const to = addMonths(from, 1);
    out.push({ label: MONTH.format(from), from, to, days: daysBetween(from, to) });
    from = to;
  }
  return out;
}

/** "12/10/2026 al 18/10/2026" (el último día incluido). */
export const periodRangeLabel = (p: Period): string =>
  `${formatDate(p.from)} al ${formatDate(new Date(p.to.getTime() - DAY_MS))}`;

/** Diferencia y porcentaje (fracción: 0,25 = 25 %) contra el período anterior; sin porcentaje si el anterior es 0. */
export function variation(current: number, previous: number): { diffCents: number; pct: number | null } {
  const diffCents = current - previous;
  return { diffCents, pct: previous === 0 ? null : diffCents / Math.abs(previous) };
}
```

`src/lib/format.ts`:

```ts
import { formatARS } from "@/domain/money";

export function formatPct(fraction: number | null, maxDigits = 1): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: maxDigits }).format(fraction);
}

export const formatSignedPct = (fraction: number): string => `${fraction > 0 ? "+" : ""}${formatPct(fraction)}`;

export function formatSignedARS(cents: number): string {
  if (cents === 0) return formatARS(0);
  return `${cents > 0 ? "+" : "−"}${formatARS(Math.abs(cents))}`;
}

/** Monto abreviado para los ejes de los gráficos (p. ej. "$ 1,5 M"). */
export const formatCompactARS = (cents: number): string =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", notation: "compact", maximumFractionDigits: 1 }).format(
    cents / 100,
  );

export function formatDays(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return "—";
  const rounded = Math.round(days * 10) / 10;
  return `${rounded.toLocaleString("es-AR")} ${rounded === 1 ? "día" : "días"}`;
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/domain/analytics/period.test.ts src/lib/format.test.ts`
Expected: PASS. Si algún valor de `Intl` difiere por el ICU de Node (por ejemplo el texto del porcentaje), ajustar el **test** a la salida real de `Intl` manteniendo la intención (contiene "53,3" y "%"; `formatDays(2.25)` = "2,3 días"), no la implementación.

- [ ] **Step 5: Commit**

```bash
git add src/domain/analytics/common.ts src/domain/analytics/period.ts src/domain/analytics/period.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(analíticas): períodos, tramos, variación y formato"
```

---

### Task 3: Finanzas (TDD)

**Files:**
- Create: `src/domain/analytics/finance.ts`
- Test: `src/domain/analytics/finance.test.ts`

**Interfaces:**
- Consumes: `Bucket` (Task 2 `period.ts`), `PlanKind`, `inRange`, `daysBetween` (Task 2 `common.ts`).
- Produces:

```ts
export const DAYS_PER_MONTH = 30.4375;
export interface FinancePayment { amountCents: number; paidAt: Date; method: string; kind: PlanKind; clientId: string; clientName: string; projectId: string; projectName: string }
export interface FinanceInstallment { amountCents: number; paidCents: number; dueDate: Date }
export interface FinanceAsset { managedByNaro: boolean; costCents: number | null; costEveryMonths: number }
export function assetCostForDays(costCents: number, everyMonths: number, days: number): number;
export function infraCostForDays(assets: FinanceAsset[], days: number): number;
export function financeSummary(a: { payments: FinancePayment[]; installments: FinanceInstallment[]; assets: FinanceAsset[] }, from: Date, to: Date, today: Date): {
  collectedCents: number; projectedCents: number; fulfillmentPct: number | null; upcomingCents: number; overdueCents: number;
  infraCostCents: number; netCents: number;
  byKind: { oneTimeCents: number; subscriptionCents: number; maintenanceCents: number };
  byMethod: { method: string; cents: number }[];
};
export interface SeriesPoint { label: string; from: Date; collectedCents: number; projectedCents: number; costCents: number; netCents: number }
export function financeSeries(a: same input, buckets: Bucket[], today: Date): SeriesPoint[];
export interface TopEntry { id: string; name: string; cents: number; sharePct: number }
export function topCollected(payments: FinancePayment[], from: Date, to: Date, by: "client" | "project", limit?: number): TopEntry[];
export function topShare(payments: FinancePayment[], from: Date, to: Date, n?: number): number | null;
```

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/analytics/finance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { bucketsOf, resolvePeriod } from "./period";
import {
  assetCostForDays,
  financeSeries,
  financeSummary,
  infraCostForDays,
  topCollected,
  topShare,
  type FinancePayment,
} from "./finance";

const today = d("2026-10-14");
const from = d("2026-10-01");
const to = d("2026-11-01");

const pay = (
  amountCents: number,
  paidAt: string,
  over: Partial<FinancePayment> = {},
): FinancePayment => ({
  amountCents,
  paidAt: d(paidAt),
  method: "Transferencia",
  kind: "DESARROLLO",
  clientId: "c1",
  clientName: "Ana",
  projectId: "p1",
  projectName: "Web Ana",
  ...over,
});

describe("assetCostForDays / infraCostForDays", () => {
  it("reparte el costo por día según cada cuántos meses se paga", () => {
    // 3.043.750 centavos por mes de 30,4375 días = 100.000 por día
    expect(assetCostForDays(3_043_750, 1, 10)).toBe(1_000_000);
    // 36.525.000 por 12 meses (365,25 días) = 100.000 por día
    expect(assetCostForDays(36_525_000, 12, 7)).toBe(700_000);
  });

  it("solo suma activos de Naro con costo y periodicidad válida", () => {
    const assets = [
      { managedByNaro: true, costCents: 3_652_500, costEveryMonths: 12 }, // 10.000 por día
      { managedByNaro: false, costCents: 1_000_000, costEveryMonths: 12 }, // del cliente
      { managedByNaro: true, costCents: null, costEveryMonths: 12 }, // sin costo
      { managedByNaro: true, costCents: 0, costEveryMonths: 12 }, // costo cero
      { managedByNaro: true, costCents: 500_000, costEveryMonths: 0 }, // periodicidad inválida
      { managedByNaro: true, costCents: 500_000, costEveryMonths: -3 },
      { managedByNaro: true, costCents: 500_000, costEveryMonths: Number.NaN },
    ];
    expect(infraCostForDays(assets, 31)).toBe(310_000);
    expect(infraCostForDays([], 31)).toBe(0);
  });
});

describe("financeSummary", () => {
  const input = {
    payments: [
      pay(100_000, "2026-10-02"),
      pay(50_000, "2026-10-10", { method: "Efectivo", kind: "SUSCRIPCION", clientId: "c2", clientName: "Beto", projectId: "p2", projectName: "App Beto" }),
      pay(25_000, "2026-10-12", { kind: "MANTENIMIENTO" }),
      pay(999, "2026-09-30"), // mes anterior
      pay(888, "2026-11-01"), // mes siguiente (el límite `hasta` no entra)
    ],
    installments: [
      { amountCents: 500_000, paidCents: 0, dueDate: d("2026-10-20") }, // por cobrar
      { amountCents: 300_000, paidCents: 100_000, dueDate: d("2026-10-05") }, // parcial y ya vencida
      { amountCents: 700_000, paidCents: 700_000, dueDate: d("2026-10-12") }, // pagada
      { amountCents: 999, paidCents: 0, dueDate: d("2026-09-30") }, // fuera del rango
      { amountCents: 888, paidCents: 0, dueDate: d("2026-11-01") }, // el límite `hasta` no entra
    ],
    assets: [{ managedByNaro: true, costCents: 3_652_500, costEveryMonths: 12 }],
  };

  it("cobrado = pagos del mes, por origen y por método", () => {
    const s = financeSummary(input, from, to, today);
    expect(s.collectedCents).toBe(175_000);
    expect(s.byKind).toEqual({ oneTimeCents: 100_000, subscriptionCents: 50_000, maintenanceCents: 25_000 });
    expect(s.byMethod).toEqual([
      { method: "Transferencia", cents: 125_000 },
      { method: "Efectivo", cents: 50_000 },
    ]);
  });

  it("proyectado, cumplimiento, por cobrar y vencido salen de las cuotas que vencen en el rango", () => {
    const s = financeSummary(input, from, to, today);
    expect(s.projectedCents).toBe(1_500_000);
    expect(s.fulfillmentPct).toBeCloseTo(800_000 / 1_500_000, 6);
    expect(s.upcomingCents).toBe(500_000);
    expect(s.overdueCents).toBe(200_000);
  });

  it("costos de infraestructura y balance neto (puede ser negativo)", () => {
    const s = financeSummary(input, from, to, today);
    expect(s.infraCostCents).toBe(310_000);
    expect(s.netCents).toBe(175_000 - 310_000);
    expect(s.netCents).toBeLessThan(0);
  });

  it("un pago el día `desde` entra y el del día `hasta` no", () => {
    const s = financeSummary(
      { payments: [pay(10, "2026-10-01"), pay(20, "2026-11-01")], installments: [], assets: [] },
      from,
      to,
      today,
    );
    expect(s.collectedCents).toBe(10);
  });

  it("el cobrado cuenta el pago por su fecha aunque la cuota sea de otro mes (cumplimiento no)", () => {
    const s = financeSummary(
      {
        payments: [pay(300, "2026-10-03")], // pago de octubre por una cuota de septiembre
        installments: [{ amountCents: 300, paidCents: 300, dueDate: d("2026-09-20") }],
        assets: [],
      },
      from,
      to,
      today,
    );
    expect(s.collectedCents).toBe(300);
    expect(s.projectedCents).toBe(0);
    expect(s.fulfillmentPct).toBeNull();
  });

  it("sin datos todo es 0 o null (nunca NaN)", () => {
    const s = financeSummary({ payments: [], installments: [], assets: [] }, from, to, today);
    expect(s).toEqual({
      collectedCents: 0,
      projectedCents: 0,
      fulfillmentPct: null,
      upcomingCents: 0,
      overdueCents: 0,
      infraCostCents: 0,
      netCents: 0,
      byKind: { oneTimeCents: 0, subscriptionCents: 0, maintenanceCents: 0 },
      byMethod: [],
    });
  });
});

describe("financeSeries", () => {
  it("un punto por tramo con cobrado, proyectado, costo y neto", () => {
    const week = resolvePeriod("semana", today).current; // 12/10 al 18/10
    const series = financeSeries(
      {
        payments: [pay(100, "2026-10-12"), pay(50, "2026-10-14")],
        installments: [{ amountCents: 70, paidCents: 0, dueDate: d("2026-10-15") }],
        assets: [{ managedByNaro: true, costCents: 3_043_750, costEveryMonths: 1 }], // 100.000 por día
      },
      bucketsOf(week),
      today,
    );
    expect(series).toHaveLength(7);
    expect(series.map((s) => s.collectedCents)).toEqual([100, 0, 50, 0, 0, 0, 0]);
    expect(series[3].projectedCents).toBe(70);
    expect(series.every((s) => s.costCents === 100_000)).toBe(true);
    expect(series[0].netCents).toBe(100 - 100_000);
    expect(series.reduce((s, x) => s + x.collectedCents, 0)).toBe(150);
  });

  it("los tramos mensuales suman lo mismo que el resumen del período", () => {
    const half = resolvePeriod("6m", today).current;
    const payments = [pay(10, "2026-05-01"), pay(20, "2026-07-15"), pay(30, "2026-10-31"), pay(99, "2026-04-30")];
    const series = financeSeries({ payments, installments: [], assets: [] }, bucketsOf(half), today);
    expect(series).toHaveLength(6);
    expect(series.reduce((s, x) => s + x.collectedCents, 0)).toBe(
      financeSummary({ payments, installments: [], assets: [] }, half.from, half.to, today).collectedCents,
    );
  });
});

describe("topCollected / topShare", () => {
  const payments = [
    pay(100_000, "2026-10-02"),
    pay(25_000, "2026-10-12"),
    pay(50_000, "2026-10-10", { clientId: "c2", clientName: "Beto", projectId: "p2", projectName: "App Beto" }),
    pay(999, "2026-09-30"),
  ];

  it("ranking por cliente y por proyecto con el porcentaje del total", () => {
    const byClient = topCollected(payments, from, to, "client");
    expect(byClient.map((e) => [e.id, e.cents])).toEqual([["c1", 125_000], ["c2", 50_000]]);
    expect(byClient[0].sharePct).toBeCloseTo(125_000 / 175_000, 6);
    expect(topCollected(payments, from, to, "project").map((e) => e.id)).toEqual(["p1", "p2"]);
  });

  it("respeta el límite", () => {
    expect(topCollected(payments, from, to, "client", 1)).toHaveLength(1);
  });

  it("concentración de los primeros N clientes; null sin cobros", () => {
    expect(topShare(payments, from, to, 1)).toBeCloseTo(125_000 / 175_000, 6);
    expect(topShare(payments, from, to, 3)).toBeCloseTo(1, 6);
    expect(topShare([], from, to)).toBeNull();
    expect(topCollected([], from, to, "client")).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/domain/analytics/finance.test.ts`
Expected: FAIL (`Cannot find module './finance'`).

- [ ] **Step 3: Implementar**

`src/domain/analytics/finance.ts`:

```ts
import { daysBetween, inRange, type PlanKind } from "./common";
import type { Bucket } from "./period";

export const DAYS_PER_MONTH = 30.4375;

export interface FinancePayment {
  amountCents: number;
  paidAt: Date;
  method: string;
  kind: PlanKind;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
}

export interface FinanceInstallment {
  amountCents: number;
  paidCents: number;
  dueDate: Date;
}

export interface FinanceAsset {
  managedByNaro: boolean;
  costCents: number | null;
  costEveryMonths: number;
}

/** Costo diario = costo ÷ (cada N meses × 30,4375); se multiplica por los días del rango. */
export function assetCostForDays(costCents: number, everyMonths: number, days: number): number {
  return Math.round((costCents / (everyMonths * DAYS_PER_MONTH)) * days);
}

/** Solo activos de Naro con costo y periodicidad válida (>= 1); el resto no suma. */
export function infraCostForDays(assets: FinanceAsset[], days: number): number {
  let total = 0;
  for (const a of assets) {
    if (!a.managedByNaro || !a.costCents || a.costCents <= 0) continue;
    if (!Number.isFinite(a.costEveryMonths) || a.costEveryMonths < 1) continue;
    total += assetCostForDays(a.costCents, a.costEveryMonths, days);
  }
  return total;
}

interface FinanceInput {
  payments: FinancePayment[];
  installments: FinanceInstallment[];
  assets: FinanceAsset[];
}

export function financeSummary(a: FinanceInput, from: Date, to: Date, today: Date) {
  let collectedCents = 0;
  const byKind = { oneTimeCents: 0, subscriptionCents: 0, maintenanceCents: 0 };
  const methods = new Map<string, number>();
  for (const p of a.payments) {
    if (!inRange(p.paidAt, from, to)) continue;
    collectedCents += p.amountCents;
    if (p.kind === "DESARROLLO") byKind.oneTimeCents += p.amountCents;
    else if (p.kind === "SUSCRIPCION") byKind.subscriptionCents += p.amountCents;
    else byKind.maintenanceCents += p.amountCents;
    methods.set(p.method, (methods.get(p.method) ?? 0) + p.amountCents);
  }

  let projectedCents = 0;
  let coveredCents = 0;
  let upcomingCents = 0;
  let overdueCents = 0;
  for (const i of a.installments) {
    if (!inRange(i.dueDate, from, to)) continue;
    projectedCents += i.amountCents;
    coveredCents += Math.min(i.paidCents, i.amountCents);
    const remaining = Math.max(0, i.amountCents - i.paidCents);
    if (i.dueDate.getTime() < today.getTime()) overdueCents += remaining;
    else upcomingCents += remaining;
  }

  const infraCostCents = infraCostForDays(a.assets, daysBetween(from, to));
  return {
    collectedCents,
    projectedCents,
    fulfillmentPct: projectedCents === 0 ? null : coveredCents / projectedCents,
    upcomingCents,
    overdueCents,
    infraCostCents,
    netCents: collectedCents - infraCostCents,
    byKind,
    byMethod: [...methods].map(([method, cents]) => ({ method, cents })).sort((x, y) => y.cents - x.cents),
  };
}

export interface SeriesPoint {
  label: string;
  from: Date;
  collectedCents: number;
  projectedCents: number;
  costCents: number;
  netCents: number;
}

export function financeSeries(a: FinanceInput, buckets: Bucket[], today: Date): SeriesPoint[] {
  return buckets.map((b) => {
    const s = financeSummary(a, b.from, b.to, today);
    return {
      label: b.label,
      from: b.from,
      collectedCents: s.collectedCents,
      projectedCents: s.projectedCents,
      costCents: s.infraCostCents,
      netCents: s.netCents,
    };
  });
}

export interface TopEntry {
  id: string;
  name: string;
  cents: number;
  sharePct: number;
}

export function topCollected(
  payments: FinancePayment[],
  from: Date,
  to: Date,
  by: "client" | "project",
  limit = 5,
): TopEntry[] {
  const map = new Map<string, { name: string; cents: number }>();
  let total = 0;
  for (const p of payments) {
    if (!inRange(p.paidAt, from, to)) continue;
    total += p.amountCents;
    const id = by === "client" ? p.clientId : p.projectId;
    const name = by === "client" ? p.clientName : p.projectName;
    const entry = map.get(id) ?? { name, cents: 0 };
    entry.cents += p.amountCents;
    map.set(id, entry);
  }
  return [...map]
    .map(([id, e]) => ({ id, name: e.name, cents: e.cents, sharePct: total === 0 ? 0 : e.cents / total }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Porcentaje (fracción) del cobrado que aportan los primeros `n` clientes; null si no hay cobros. */
export function topShare(payments: FinancePayment[], from: Date, to: Date, n = 3): number | null {
  const top = topCollected(payments, from, to, "client", n);
  if (top.length === 0) return null;
  return top.reduce((s, t) => s + t.sharePct, 0);
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/domain/analytics/finance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/analytics/finance.ts src/domain/analytics/finance.test.ts
git commit -m "feat(analíticas): métricas financieras (cobrado, proyectado, costos, neto, series, ranking)"
```

---

### Task 4: Cobranza (TDD)

**Files:**
- Create: `src/domain/analytics/collections.ts`
- Test: `src/domain/analytics/collections.test.ts`

**Interfaces:**
- Consumes: `inRange` (Task 2), `diffDays` de `../dates`.
- Produces:

```ts
export interface CollectionInstallment { amountCents: number; paidCents: number; dueDate: Date; lastPaidAt: Date | null; clientId: string; clientName: string }
export type AgingKey = "1-7" | "8-30" | "31-60" | "60+";
export const AGING_KEYS: AgingKey[];
export function agingBuckets(insts: CollectionInstallment[], today: Date): { key: AgingKey; label: string; count: number; cents: number }[];
export function punctuality(insts: CollectionInstallment[], from: Date, to: Date): { count: number; onTimePct: number | null; avgLateDays: number | null };
export function debtSummary(insts: CollectionInstallment[], today: Date): { totalCents: number; dueNext30Cents: number };
export function debtorsByClient(insts: CollectionInstallment[], today: Date): { clientId: string; clientName: string; overdueCents: number; overdueCount: number; maxDaysLate: number }[];
```

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/analytics/collections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { agingBuckets, debtSummary, debtorsByClient, punctuality, type CollectionInstallment } from "./collections";

const today = d("2026-10-14");

const inst = (
  amountCents: number,
  paidCents: number,
  dueDate: string,
  over: Partial<CollectionInstallment> = {},
): CollectionInstallment => ({
  amountCents,
  paidCents,
  dueDate: d(dueDate),
  lastPaidAt: null,
  clientId: "c1",
  clientName: "Ana",
  ...over,
});

const insts: CollectionInstallment[] = [
  inst(100, 0, "2026-10-10"), // 4 días de atraso
  inst(200, 50, "2026-09-20"), // 24 días, saldo 150
  inst(300, 0, "2026-08-20", { clientId: "c2", clientName: "Beto" }), // 55 días
  inst(400, 0, "2026-06-01"), // 135 días
  inst(500, 500, "2026-09-01"), // pagada
  inst(600, 0, "2026-10-14"), // vence hoy: no está vencida
  inst(700, 0, "2026-11-10"), // dentro de 27 días
  inst(800, 0, "2026-12-30"), // fuera de los 30 días
];

describe("agingBuckets", () => {
  it("agrupa el saldo vencido por días de atraso", () => {
    expect(agingBuckets(insts, today).map((b) => [b.key, b.count, b.cents])).toEqual([
      ["1-7", 1, 100],
      ["8-30", 1, 150],
      ["31-60", 1, 300],
      ["60+", 1, 400],
    ]);
  });

  it("los límites de cada tramo (7, 8, 30, 31, 60 y 61 días)", () => {
    const edge = [
      inst(1, 0, "2026-10-07"), // 7
      inst(1, 0, "2026-10-06"), // 8
      inst(1, 0, "2026-09-14"), // 30
      inst(1, 0, "2026-09-13"), // 31
      inst(1, 0, "2026-08-15"), // 60
      inst(1, 0, "2026-08-14"), // 61
    ];
    expect(agingBuckets(edge, today).map((b) => b.count)).toEqual([1, 2, 2, 1]);
  });

  it("sin cuotas devuelve los cuatro tramos en cero", () => {
    const b = agingBuckets([], today);
    expect(b).toHaveLength(4);
    expect(b.every((x) => x.count === 0 && x.cents === 0)).toBe(true);
  });
});

describe("debtSummary", () => {
  it("deuda total y lo que vence en los próximos 30 días (hoy incluido)", () => {
    expect(debtSummary(insts, today)).toEqual({ totalCents: 100 + 150 + 300 + 400 + 600 + 700 + 800, dueNext30Cents: 600 + 700 });
    expect(debtSummary([], today)).toEqual({ totalCents: 0, dueNext30Cents: 0 });
  });
});

describe("debtorsByClient", () => {
  it("clientes con saldo vencido, de mayor a menor, con la mora más antigua", () => {
    expect(debtorsByClient(insts, today)).toEqual([
      { clientId: "c1", clientName: "Ana", overdueCents: 650, overdueCount: 3, maxDaysLate: 135 },
      { clientId: "c2", clientName: "Beto", overdueCents: 300, overdueCount: 1, maxDaysLate: 55 },
    ]);
    expect(debtorsByClient([], today)).toEqual([]);
  });
});

describe("punctuality", () => {
  const from = d("2026-10-01");
  const to = d("2026-11-01");
  const paid = (due: string, last: string | null, amount = 100, paidCents = 100) =>
    inst(amount, paidCents, due, { lastPaidAt: last ? d(last) : null });

  it("porcentaje a tiempo y demora promedio de las que pagaron tarde", () => {
    const r = punctuality(
      [
        paid("2026-10-05", "2026-10-05"), // a tiempo
        paid("2026-10-01", "2026-10-04"), // 3 días tarde
        paid("2026-10-02", "2026-10-09"), // 7 días tarde
        paid("2026-09-01", "2026-09-30"), // último pago fuera del período
        paid("2026-10-01", "2026-10-03", 100, 40), // no está totalmente paga
      ],
      from,
      to,
    );
    expect(r.count).toBe(3);
    expect(r.onTimePct).toBeCloseTo(1 / 3, 6);
    expect(r.avgLateDays).toBe(5);
  });

  it("si nadie pagó tarde no hay demora promedio", () => {
    const r = punctuality([paid("2026-10-05", "2026-10-01")], from, to);
    expect(r).toEqual({ count: 1, onTimePct: 1, avgLateDays: null });
  });

  it("sin cuotas pagadas en el período: sin porcentaje ni demora", () => {
    expect(punctuality([], from, to)).toEqual({ count: 0, onTimePct: null, avgLateDays: null });
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/domain/analytics/collections.test.ts`
Expected: FAIL (`Cannot find module './collections'`).

- [ ] **Step 3: Implementar**

`src/domain/analytics/collections.ts`:

```ts
import { diffDays } from "../dates";
import { inRange } from "./common";

export interface CollectionInstallment {
  amountCents: number;
  paidCents: number;
  dueDate: Date;
  /** Fecha del último pago registrado; null si no tiene pagos. */
  lastPaidAt: Date | null;
  clientId: string;
  clientName: string;
}

const remaining = (i: CollectionInstallment) => Math.max(0, i.amountCents - i.paidCents);

export type AgingKey = "1-7" | "8-30" | "31-60" | "60+";
export const AGING_KEYS: AgingKey[] = ["1-7", "8-30", "31-60", "60+"];
const AGING_LABEL: Record<AgingKey, string> = {
  "1-7": "1 a 7 días",
  "8-30": "8 a 30 días",
  "31-60": "31 a 60 días",
  "60+": "Más de 60 días",
};

const agingKey = (daysLate: number): AgingKey =>
  daysLate <= 7 ? "1-7" : daysLate <= 30 ? "8-30" : daysLate <= 60 ? "31-60" : "60+";

/** Saldo vencido (dueDate < hoy) agrupado por días de atraso. */
export function agingBuckets(insts: CollectionInstallment[], today: Date) {
  const acc = Object.fromEntries(AGING_KEYS.map((k) => [k, { count: 0, cents: 0 }])) as Record<
    AgingKey,
    { count: number; cents: number }
  >;
  for (const i of insts) {
    const rem = remaining(i);
    if (rem === 0 || i.dueDate.getTime() >= today.getTime()) continue;
    const bucket = acc[agingKey(diffDays(today, i.dueDate))];
    bucket.count += 1;
    bucket.cents += rem;
  }
  return AGING_KEYS.map((key) => ({ key, label: AGING_LABEL[key], ...acc[key] }));
}

/** Cuotas totalmente pagadas cuyo último pago cae en [from, to): % a tiempo y demora promedio de las tardías. */
export function punctuality(insts: CollectionInstallment[], from: Date, to: Date) {
  const paid = insts.filter(
    (i) => i.paidCents >= i.amountCents && i.lastPaidAt !== null && inRange(i.lastPaidAt, from, to),
  );
  if (paid.length === 0) return { count: 0, onTimePct: null as number | null, avgLateDays: null as number | null };
  const late = paid.filter((i) => (i.lastPaidAt as Date).getTime() > i.dueDate.getTime());
  const lateDays = late.reduce((s, i) => s + diffDays(i.lastPaidAt as Date, i.dueDate), 0);
  return {
    count: paid.length,
    onTimePct: (paid.length - late.length) / paid.length,
    avgLateDays: late.length === 0 ? null : lateDays / late.length,
  };
}

/** Deuda total (saldo de todas las cuotas) y lo que vence entre hoy y hoy + 30 días. */
export function debtSummary(insts: CollectionInstallment[], today: Date) {
  let totalCents = 0;
  let dueNext30Cents = 0;
  for (const i of insts) {
    const rem = remaining(i);
    totalCents += rem;
    const days = diffDays(i.dueDate, today);
    if (days >= 0 && days <= 30) dueNext30Cents += rem;
  }
  return { totalCents, dueNext30Cents };
}

/** Clientes con saldo vencido, de mayor a menor, con los días de atraso de la cuota más antigua. */
export function debtorsByClient(insts: CollectionInstallment[], today: Date) {
  const map = new Map<
    string,
    { clientId: string; clientName: string; overdueCents: number; overdueCount: number; maxDaysLate: number }
  >();
  for (const i of insts) {
    const rem = remaining(i);
    if (rem === 0 || i.dueDate.getTime() >= today.getTime()) continue;
    const entry = map.get(i.clientId) ?? {
      clientId: i.clientId,
      clientName: i.clientName,
      overdueCents: 0,
      overdueCount: 0,
      maxDaysLate: 0,
    };
    entry.overdueCents += rem;
    entry.overdueCount += 1;
    entry.maxDaysLate = Math.max(entry.maxDaysLate, diffDays(today, i.dueDate));
    map.set(i.clientId, entry);
  }
  return [...map.values()].sort((a, b) => b.overdueCents - a.overdueCents || a.clientName.localeCompare(b.clientName));
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/domain/analytics/collections.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/analytics/collections.ts src/domain/analytics/collections.test.ts
git commit -m "feat(analíticas): métricas de cobranza (antigüedad, puntualidad, deuda, deudores)"
```

---

### Task 5: Recurrente (TDD)

**Files:**
- Create: `src/domain/analytics/recurring.ts`
- Test: `src/domain/analytics/recurring.test.ts`

**Interfaces:**
- Consumes: `inRange`, `PlanKind` (Task 2), `Bucket` (Task 2).
- Produces:

```ts
export type ContractStatus = "ACTIVO" | "VENCIDA" | "SUSPENDIDO" | "FINALIZADO";
export interface RecurringContract { kind: "SUSCRIPCION" | "MANTENIMIENTO"; feeCents: number; status: ContractStatus; startedAt: Date; endedAt: Date | null }
export function recurringSummary(contracts: RecurringContract[], from: Date, to: Date): {
  mrr: { subscriptionCents: number; maintenanceCents: number; totalCents: number }; arrCents: number;
  subscriptions: { active: number; overdue: number; suspended: number }; maintenance: { active: number };
  activeContracts: number; avgPerContractCents: number | null; signups: number; churnedMaintenance: number; hasAny: boolean;
};
export interface RecurringPayment { amountCents: number; paidAt: Date; kind: PlanKind }
export function recurringCollectedSeries(payments: RecurringPayment[], buckets: Bucket[]): { label: string; from: Date; cents: number }[];
```

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/analytics/recurring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { recurringCollectedSeries, recurringSummary, type RecurringContract } from "./recurring";

const from = d("2026-10-01");
const to = d("2026-11-01");

const c = (over: Partial<RecurringContract>): RecurringContract => ({
  kind: "SUSCRIPCION",
  feeCents: 0,
  status: "ACTIVO",
  startedAt: d("2026-01-01"),
  endedAt: null,
  ...over,
});

const contracts: RecurringContract[] = [
  c({ feeCents: 400, startedAt: d("2026-10-02") }), // activa, alta en octubre
  c({ feeCents: 999, status: "VENCIDA" }), // vencida: no cuenta en el MRR
  c({ feeCents: 888, status: "SUSPENDIDO" }), // suspendida: no cuenta
  c({ kind: "MANTENIMIENTO", feeCents: 80, startedAt: d("2026-10-05") }), // activo, alta en octubre
  c({ kind: "MANTENIMIENTO", feeCents: 70, status: "FINALIZADO", startedAt: d("2026-03-01"), endedAt: d("2026-10-09") }),
];

describe("recurringSummary", () => {
  it("MRR y ARR solo de contratos activos, por origen", () => {
    const s = recurringSummary(contracts, from, to);
    expect(s.mrr).toEqual({ subscriptionCents: 400, maintenanceCents: 80, totalCents: 480 });
    expect(s.arrCents).toBe(5_760);
  });

  it("cuenta contratos por estado y el ingreso promedio por contrato activo", () => {
    const s = recurringSummary(contracts, from, to);
    expect(s.subscriptions).toEqual({ active: 1, overdue: 1, suspended: 1 });
    expect(s.maintenance).toEqual({ active: 1 });
    expect(s.activeContracts).toBe(2);
    expect(s.avgPerContractCents).toBe(240);
    expect(s.hasAny).toBe(true);
  });

  it("altas del período (por fecha del plan) y bajas de mantenimiento (por fecha de baja)", () => {
    const s = recurringSummary(contracts, from, to);
    expect(s.signups).toBe(2);
    expect(s.churnedMaintenance).toBe(1);
    const next = recurringSummary(contracts, to, d("2026-12-01"));
    expect(next.signups).toBe(0);
    expect(next.churnedMaintenance).toBe(0);
  });

  it("sin contratos: ceros, promedio null y hasAny falso", () => {
    const s = recurringSummary([], from, to);
    expect(s.mrr.totalCents).toBe(0);
    expect(s.arrCents).toBe(0);
    expect(s.avgPerContractCents).toBeNull();
    expect(s.activeContracts).toBe(0);
    expect(s.hasAny).toBe(false);
  });
});

describe("recurringCollectedSeries", () => {
  it("suma por mes solo los pagos de suscripción y mantenimiento", () => {
    const buckets = [
      { label: "sep 26", from: d("2026-09-01"), to: d("2026-10-01"), days: 30 },
      { label: "oct 26", from: d("2026-10-01"), to: d("2026-11-01"), days: 31 },
    ];
    const series = recurringCollectedSeries(
      [
        { amountCents: 400, paidAt: d("2026-09-15"), kind: "SUSCRIPCION" },
        { amountCents: 80, paidAt: d("2026-10-05"), kind: "MANTENIMIENTO" },
        { amountCents: 400, paidAt: d("2026-10-15"), kind: "SUSCRIPCION" },
        { amountCents: 5_000, paidAt: d("2026-10-10"), kind: "DESARROLLO" }, // no es recurrente
        { amountCents: 1, paidAt: d("2026-11-01"), kind: "SUSCRIPCION" }, // fuera
      ],
      buckets,
    );
    expect(series.map((s) => [s.label, s.cents])).toEqual([["sep 26", 400], ["oct 26", 480]]);
    expect(recurringCollectedSeries([], buckets).every((s) => s.cents === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/domain/analytics/recurring.test.ts`
Expected: FAIL (`Cannot find module './recurring'`).

- [ ] **Step 3: Implementar**

`src/domain/analytics/recurring.ts`:

```ts
import { inRange, type PlanKind } from "./common";
import type { Bucket } from "./period";

export type ContractStatus = "ACTIVO" | "VENCIDA" | "SUSPENDIDO" | "FINALIZADO";

export interface RecurringContract {
  kind: "SUSCRIPCION" | "MANTENIMIENTO";
  feeCents: number;
  status: ContractStatus;
  /** Fecha de creación del plan recurrente (el alta). */
  startedAt: Date;
  /** Fecha de baja (solo el mantenimiento la tiene). */
  endedAt: Date | null;
}

/** MRR/ARR y contratos. El MRR cuenta solo contratos con estado ACTIVO (vencidas y suspendidas no). */
export function recurringSummary(contracts: RecurringContract[], from: Date, to: Date) {
  const mrr = { subscriptionCents: 0, maintenanceCents: 0, totalCents: 0 };
  const subscriptions = { active: 0, overdue: 0, suspended: 0 };
  const maintenance = { active: 0 };
  for (const k of contracts) {
    if (k.status === "ACTIVO") {
      if (k.kind === "SUSCRIPCION") {
        mrr.subscriptionCents += k.feeCents;
        subscriptions.active += 1;
      } else {
        mrr.maintenanceCents += k.feeCents;
        maintenance.active += 1;
      }
    } else if (k.kind === "SUSCRIPCION") {
      if (k.status === "VENCIDA") subscriptions.overdue += 1;
      if (k.status === "SUSPENDIDO") subscriptions.suspended += 1;
    }
  }
  mrr.totalCents = mrr.subscriptionCents + mrr.maintenanceCents;
  const activeContracts = subscriptions.active + maintenance.active;
  return {
    mrr,
    arrCents: mrr.totalCents * 12,
    subscriptions,
    maintenance,
    activeContracts,
    avgPerContractCents: activeContracts === 0 ? null : Math.round(mrr.totalCents / activeContracts),
    signups: contracts.filter((k) => inRange(k.startedAt, from, to)).length,
    churnedMaintenance: contracts.filter((k) => k.kind === "MANTENIMIENTO" && k.endedAt && inRange(k.endedAt, from, to)).length,
    hasAny: contracts.length > 0,
  };
}

export interface RecurringPayment {
  amountCents: number;
  paidAt: Date;
  kind: PlanKind;
}

/** Cobrado en planes de suscripción y mantenimiento, por tramo. */
export function recurringCollectedSeries(payments: RecurringPayment[], buckets: Bucket[]) {
  return buckets.map((b) => ({
    label: b.label,
    from: b.from,
    cents: payments
      .filter((p) => p.kind !== "DESARROLLO" && inRange(p.paidAt, b.from, b.to))
      .reduce((s, p) => s + p.amountCents, 0),
  }));
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/domain/analytics/recurring.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/analytics/recurring.ts src/domain/analytics/recurring.test.ts
git commit -m "feat(analíticas): métricas de ingreso recurrente (MRR, ARR, contratos, altas y bajas)"
```

---

### Task 6: Ventas (TDD)

**Files:**
- Create: `src/domain/analytics/sales.ts`
- Test: `src/domain/analytics/sales.test.ts`

**Interfaces:**
- Consumes: `inRange` (Task 2), `diffDays` de `../dates`.
- Produces:

```ts
export type ProposalStatus = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA";
export interface SalesProposal {
  status: ProposalStatus; createdAt: Date; validUntil: Date | null; oneTimePriceCents: number;
  project: { createdAt: Date; contractType: "PAGO_UNICO" | "SUSCRIPCION"; totalCents: number | null; monthlyFeeCents: number | null } | null;
}
export function salesSummary(proposals: SalesProposal[], from: Date, to: Date, today: Date): {
  created: number; byStatus: Record<ProposalStatus, number>; conversionPct: number | null; decidedConversionPct: number | null;
  proposedValueCents: number; closedCount: number; acceptedOneTimeValueCents: number; acceptedMonthlyFeeCents: number;
  avgDaysToClose: number | null; mix: { oneTime: number; subscription: number }; avgTicketCents: number | null;
  pipeline: { count: number; valueCents: number; expiredCount: number };
};
```

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/analytics/sales.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { salesSummary, type SalesProposal } from "./sales";

const from = d("2026-10-01");
const to = d("2026-11-01");
const today = d("2026-10-14");

const prop = (over: Partial<SalesProposal> & Pick<SalesProposal, "status" | "createdAt" | "oneTimePriceCents">): SalesProposal => ({
  validUntil: null,
  project: null,
  ...over,
});

const proposals: SalesProposal[] = [
  prop({ status: "ACEPTADA", createdAt: d("2026-10-02"), oneTimePriceCents: 1000, project: { createdAt: d("2026-10-06"), contractType: "PAGO_UNICO", totalCents: 900, monthlyFeeCents: null } }),
  prop({ status: "ACEPTADA", createdAt: d("2026-10-03"), oneTimePriceCents: 800, project: { createdAt: d("2026-10-13"), contractType: "SUSCRIPCION", totalCents: null, monthlyFeeCents: 40 } }),
  prop({ status: "RECHAZADA", createdAt: d("2026-10-04"), oneTimePriceCents: 500 }),
  prop({ status: "ENVIADA", createdAt: d("2026-10-05"), oneTimePriceCents: 600, validUntil: d("2026-10-10") }),
  prop({ status: "BORRADOR", createdAt: d("2026-10-06"), oneTimePriceCents: 100 }),
  // creada en septiembre pero cerrada en octubre: cuenta como cierre del período, no como creada
  prop({ status: "ACEPTADA", createdAt: d("2026-09-15"), oneTimePriceCents: 2000, project: { createdAt: d("2026-10-01"), contractType: "PAGO_UNICO", totalCents: 1800, monthlyFeeCents: null } }),
];

describe("salesSummary", () => {
  it("propuestas creadas, estado actual y conversión", () => {
    const s = salesSummary(proposals, from, to, today);
    expect(s.created).toBe(5);
    expect(s.byStatus).toEqual({ BORRADOR: 1, ENVIADA: 1, ACEPTADA: 2, RECHAZADA: 1 });
    expect(s.conversionPct).toBeCloseTo(2 / 5, 6);
    expect(s.decidedConversionPct).toBeCloseTo(2 / 3, 6);
    expect(s.proposedValueCents).toBe(3000);
  });

  it("valores aceptados, mix, ticket y días hasta el cierre (por fecha del proyecto)", () => {
    const s = salesSummary(proposals, from, to, today);
    expect(s.closedCount).toBe(3);
    expect(s.acceptedOneTimeValueCents).toBe(2700);
    expect(s.acceptedMonthlyFeeCents).toBe(40);
    expect(s.mix).toEqual({ oneTime: 2, subscription: 1 });
    expect(s.avgTicketCents).toBe(1350);
    expect(s.avgDaysToClose).toBe(10); // (4 + 10 + 16) / 3
  });

  it("pipeline abierto (no depende del período): borradores y enviadas", () => {
    const s = salesSummary(proposals, from, to, today);
    expect(s.pipeline).toEqual({ count: 2, valueCents: 700, expiredCount: 1 });
    const empty = salesSummary(proposals, d("2025-01-01"), d("2025-02-01"), today);
    expect(empty.pipeline).toEqual({ count: 2, valueCents: 700, expiredCount: 1 });
  });

  it("una propuesta creada el día `hasta` no entra en el período", () => {
    const s = salesSummary([prop({ status: "BORRADOR", createdAt: d("2026-11-01"), oneTimePriceCents: 5 })], from, to, today);
    expect(s.created).toBe(0);
  });

  it("sin propuestas: ceros y null (nunca NaN)", () => {
    const s = salesSummary([], from, to, today);
    expect(s).toEqual({
      created: 0,
      byStatus: { BORRADOR: 0, ENVIADA: 0, ACEPTADA: 0, RECHAZADA: 0 },
      conversionPct: null,
      decidedConversionPct: null,
      proposedValueCents: 0,
      closedCount: 0,
      acceptedOneTimeValueCents: 0,
      acceptedMonthlyFeeCents: 0,
      avgDaysToClose: null,
      mix: { oneTime: 0, subscription: 0 },
      avgTicketCents: null,
      pipeline: { count: 0, valueCents: 0, expiredCount: 0 },
    });
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/domain/analytics/sales.test.ts`
Expected: FAIL (`Cannot find module './sales'`).

- [ ] **Step 3: Implementar**

`src/domain/analytics/sales.ts`:

```ts
import { diffDays } from "../dates";
import { inRange } from "./common";

export type ProposalStatus = "BORRADOR" | "ENVIADA" | "ACEPTADA" | "RECHAZADA";

export interface SalesProposal {
  status: ProposalStatus;
  createdAt: Date;
  validUntil: Date | null;
  oneTimePriceCents: number;
  /** Proyecto que nació al aceptarla (su fecha de creación es la fecha de aceptación). */
  project: {
    createdAt: Date;
    contractType: "PAGO_UNICO" | "SUSCRIPCION";
    totalCents: number | null;
    monthlyFeeCents: number | null;
  } | null;
}

export function salesSummary(proposals: SalesProposal[], from: Date, to: Date, today: Date) {
  const created = proposals.filter((p) => inRange(p.createdAt, from, to));
  const byStatus: Record<ProposalStatus, number> = { BORRADOR: 0, ENVIADA: 0, ACEPTADA: 0, RECHAZADA: 0 };
  for (const p of created) byStatus[p.status] += 1;
  const decided = byStatus.ACEPTADA + byStatus.RECHAZADA;

  // Cierres del período: aceptadas cuyo proyecto se creó en el rango (aunque la propuesta sea anterior).
  const closed = proposals.filter((p) => p.status === "ACEPTADA" && p.project && inRange(p.project.createdAt, from, to));
  let acceptedOneTimeValueCents = 0;
  let acceptedMonthlyFeeCents = 0;
  const mix = { oneTime: 0, subscription: 0 };
  let closeDays = 0;
  for (const p of closed) {
    const project = p.project as NonNullable<SalesProposal["project"]>;
    if (project.contractType === "PAGO_UNICO") {
      mix.oneTime += 1;
      acceptedOneTimeValueCents += project.totalCents ?? 0;
    } else {
      mix.subscription += 1;
      acceptedMonthlyFeeCents += project.monthlyFeeCents ?? 0;
    }
    closeDays += diffDays(project.createdAt, p.createdAt);
  }

  const open = proposals.filter((p) => p.status === "BORRADOR" || p.status === "ENVIADA");
  return {
    created: created.length,
    byStatus,
    conversionPct: created.length === 0 ? null : byStatus.ACEPTADA / created.length,
    decidedConversionPct: decided === 0 ? null : byStatus.ACEPTADA / decided,
    proposedValueCents: created.reduce((s, p) => s + p.oneTimePriceCents, 0),
    closedCount: closed.length,
    acceptedOneTimeValueCents,
    acceptedMonthlyFeeCents,
    avgDaysToClose: closed.length === 0 ? null : closeDays / closed.length,
    mix,
    avgTicketCents: mix.oneTime === 0 ? null : Math.round(acceptedOneTimeValueCents / mix.oneTime),
    pipeline: {
      count: open.length,
      valueCents: open.reduce((s, p) => s + p.oneTimePriceCents, 0),
      expiredCount: open.filter((p) => p.validUntil !== null && p.validUntil.getTime() < today.getTime()).length,
    },
  };
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/domain/analytics/sales.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/analytics/sales.ts src/domain/analytics/sales.test.ts
git commit -m "feat(analíticas): métricas de ventas (conversión, valores, mix, pipeline)"
```

---

### Task 7: Proyectos, clientes e infraestructura (TDD)

**Files:**
- Create: `src/domain/analytics/portfolio.ts`, `src/domain/analytics/infra.ts`
- Test: `src/domain/analytics/portfolio.test.ts`, `src/domain/analytics/infra.test.ts`

**Interfaces:**
- Consumes: `inRange` (Task 2), `diffDays` de `../dates`.
- Produces:

```ts
// portfolio.ts
export type Stage = "COTIZACION" | "EN_DESARROLLO" | "ENTREGADO" | "EN_MANTENIMIENTO";
export const STAGES: Stage[];
export interface PortfolioProject { clientId: string; stage: Stage; contractType: "PAGO_UNICO" | "SUSCRIPCION"; totalCents: number | null; monthlyFeeCents: number | null; createdAt: Date; startedAt: Date | null; deliveredAt: Date | null; activeRecurring: boolean }
export interface PortfolioClient { id: string; name: string; createdAt: Date; collectedCents: number }
export function projectsSummary(projects: PortfolioProject[], from: Date, to: Date): { byStage: { stage: Stage; count: number; contractedCents: number; monthlyCents: number }[]; created: number; delivered: number; avgDevDays: number | null };
export function clientsSummary(clients: PortfolioClient[], projects: PortfolioProject[], from: Date, to: Date): { total: number; newInPeriod: number; withActiveWork: number; top: { id: string; name: string; cents: number }[] };
// infra.ts
export type AssetType = "DOMINIO" | "HOSTING" | "SERVIDOR";
export interface InfraAsset { id: string; type: AssetType; identifier: string; projectName: string; managedByNaro: boolean; costCents: number | null; costEveryMonths: number; renewalDate: Date }
export interface Renewal { id: string; type: AssetType; identifier: string; projectName: string; renewalDate: Date; managedByNaro: boolean; costCents: number | null }
export interface RenewalGroup { items: Renewal[]; costCents: number }
export function infraSummary(assets: InfraAsset[], today: Date): {
  monthlyEquivalentCents: number; total: number;
  byType: { type: AssetType; naro: number; client: number }[];
  renewals: { expired: RenewalGroup; next30: RenewalGroup; next60: RenewalGroup; next90: RenewalGroup };
};
```

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/analytics/portfolio.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { clientsSummary, projectsSummary, type PortfolioClient, type PortfolioProject } from "./portfolio";

const from = d("2026-10-01");
const to = d("2026-11-01");

const proj = (over: Partial<PortfolioProject> & Pick<PortfolioProject, "clientId" | "stage" | "createdAt">): PortfolioProject => ({
  contractType: "PAGO_UNICO",
  totalCents: null,
  monthlyFeeCents: null,
  startedAt: null,
  deliveredAt: null,
  activeRecurring: false,
  ...over,
});

const projects: PortfolioProject[] = [
  proj({ clientId: "c1", stage: "EN_DESARROLLO", createdAt: d("2026-10-02"), totalCents: 1000, startedAt: d("2026-10-03") }),
  proj({ clientId: "c1", stage: "ENTREGADO", createdAt: d("2026-08-01"), totalCents: 500, startedAt: d("2026-08-10"), deliveredAt: d("2026-10-05") }),
  proj({ clientId: "c2", stage: "EN_MANTENIMIENTO", createdAt: d("2026-01-01"), totalCents: 300, startedAt: d("2026-01-10"), deliveredAt: d("2026-02-01") }),
  proj({ clientId: "c3", stage: "EN_DESARROLLO", contractType: "SUSCRIPCION", monthlyFeeCents: 40, createdAt: d("2026-10-12"), activeRecurring: true }),
  proj({ clientId: "c4", stage: "COTIZACION", createdAt: d("2026-09-01"), totalCents: 200 }),
];

describe("projectsSummary", () => {
  it("cantidad, contratado y abono mensual por etapa (todas las etapas, en orden)", () => {
    const s = projectsSummary(projects, from, to);
    expect(s.byStage.map((x) => [x.stage, x.count, x.contractedCents, x.monthlyCents])).toEqual([
      ["COTIZACION", 1, 200, 0],
      ["EN_DESARROLLO", 2, 1000, 40],
      ["ENTREGADO", 1, 500, 0],
      ["EN_MANTENIMIENTO", 1, 300, 0],
    ]);
  });

  it("nuevos y entregados del período y duración promedio del desarrollo", () => {
    const s = projectsSummary(projects, from, to);
    expect(s.created).toBe(2);
    expect(s.delivered).toBe(1);
    expect(s.avgDevDays).toBe(56); // 10/08 → 05/10
  });

  it("sin entregas en el período no hay duración promedio; sin proyectos todo en cero", () => {
    expect(projectsSummary(projects, d("2025-01-01"), d("2025-02-01")).avgDevDays).toBeNull();
    const empty = projectsSummary([], from, to);
    expect(empty.created).toBe(0);
    expect(empty.delivered).toBe(0);
    expect(empty.avgDevDays).toBeNull();
    expect(empty.byStage.every((x) => x.count === 0)).toBe(true);
  });
});

describe("clientsSummary", () => {
  const clients: PortfolioClient[] = [
    { id: "c1", name: "Ana", createdAt: d("2026-01-05"), collectedCents: 900 },
    { id: "c2", name: "Beto", createdAt: d("2026-10-03"), collectedCents: 300 },
    { id: "c3", name: "Cami", createdAt: d("2026-10-12"), collectedCents: 0 },
    { id: "c4", name: "Dani", createdAt: d("2026-02-01"), collectedCents: 50 },
    { id: "c5", name: "Eli", createdAt: d("2026-03-01"), collectedCents: 0 },
  ];

  it("totales, nuevos, con trabajo en curso y ranking por cobrado histórico", () => {
    const s = clientsSummary(clients, projects, from, to);
    expect(s.total).toBe(5);
    expect(s.newInPeriod).toBe(2);
    expect(s.withActiveWork).toBe(3); // c1 (desarrollo), c2 (mantenimiento), c3 (suscripción activa)
    expect(s.top).toEqual([
      { id: "c1", name: "Ana", cents: 900 },
      { id: "c2", name: "Beto", cents: 300 },
      { id: "c4", name: "Dani", cents: 50 },
    ]);
  });

  it("sin clientes todo en cero", () => {
    expect(clientsSummary([], [], from, to)).toEqual({ total: 0, newInPeriod: 0, withActiveWork: 0, top: [] });
  });

  it("el ranking se limita a 10", () => {
    const many = Array.from({ length: 12 }, (_, i): PortfolioClient => ({ id: `x${i}`, name: `N${i}`, createdAt: d("2026-01-01"), collectedCents: i + 1 }));
    expect(clientsSummary(many, [], from, to).top).toHaveLength(10);
  });
});
```

`src/domain/analytics/infra.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { infraSummary, type InfraAsset } from "./infra";

const today = d("2026-10-14");

const asset = (over: Partial<InfraAsset> & Pick<InfraAsset, "id" | "type" | "renewalDate">): InfraAsset => ({
  identifier: over.id,
  projectName: "Proyecto",
  managedByNaro: true,
  costCents: null,
  costEveryMonths: 12,
  ...over,
});

const assets: InfraAsset[] = [
  asset({ id: "d1", type: "DOMINIO", renewalDate: d("2026-10-20"), costCents: 20_000 }), // en 6 días
  asset({ id: "h1", type: "HOSTING", renewalDate: d("2026-11-20"), costCents: 5_000, costEveryMonths: 1 }), // en 37 días
  asset({ id: "s1", type: "SERVIDOR", renewalDate: d("2026-12-30") }), // en 77 días, sin costo
  asset({ id: "d2", type: "DOMINIO", renewalDate: d("2026-10-10"), managedByNaro: false, costCents: 9_999 }), // vencido, del cliente
  asset({ id: "d3", type: "DOMINIO", renewalDate: d("2027-06-01"), costCents: 12_000 }), // lejano
];

describe("infraSummary", () => {
  it("costo mensual equivalente: solo activos de Naro con costo", () => {
    expect(infraSummary(assets, today).monthlyEquivalentCents).toBe(1667 + 5000 + 1000);
    expect(infraSummary(assets, today).total).toBe(5);
  });

  it("activos por tipo, separando Naro y cliente", () => {
    expect(infraSummary(assets, today).byType).toEqual([
      { type: "DOMINIO", naro: 2, client: 1 },
      { type: "HOSTING", naro: 1, client: 0 },
      { type: "SERVIDOR", naro: 1, client: 0 },
    ]);
  });

  it("renovaciones vencidas y a 30, 60 y 90 días con su costo (solo lo que paga Naro)", () => {
    const { renewals } = infraSummary(assets, today);
    expect(renewals.expired.items.map((r) => r.id)).toEqual(["d2"]);
    expect(renewals.expired.costCents).toBe(0);
    expect(renewals.next30.items.map((r) => r.id)).toEqual(["d1"]);
    expect(renewals.next30.costCents).toBe(20_000);
    expect(renewals.next60.items.map((r) => r.id)).toEqual(["h1"]);
    expect(renewals.next60.costCents).toBe(5_000);
    expect(renewals.next90.items.map((r) => r.id)).toEqual(["s1"]);
    expect(renewals.next90.costCents).toBe(0);
  });

  it("los límites: hoy, 30, 31, 60, 61 y 90 días", () => {
    const edge = [
      asset({ id: "a", type: "DOMINIO", renewalDate: d("2026-10-14") }), // 0
      asset({ id: "b", type: "DOMINIO", renewalDate: d("2026-11-13") }), // 30
      asset({ id: "c", type: "DOMINIO", renewalDate: d("2026-11-14") }), // 31
      asset({ id: "e", type: "DOMINIO", renewalDate: d("2026-12-13") }), // 60
      asset({ id: "f", type: "DOMINIO", renewalDate: d("2026-12-14") }), // 61
      asset({ id: "g", type: "DOMINIO", renewalDate: d("2027-01-12") }), // 90
      asset({ id: "h", type: "DOMINIO", renewalDate: d("2027-01-13") }), // 91 (fuera)
    ];
    const r = infraSummary(edge, today).renewals;
    expect(r.next30.items.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.next60.items.map((x) => x.id)).toEqual(["c", "e"]);
    expect(r.next90.items.map((x) => x.id)).toEqual(["f", "g"]);
  });

  it("periodicidad inválida no suma al costo mensual; sin activos todo en cero", () => {
    const bad = [asset({ id: "x", type: "HOSTING", renewalDate: d("2026-11-01"), costCents: 1000, costEveryMonths: 0 })];
    expect(infraSummary(bad, today).monthlyEquivalentCents).toBe(0);
    const empty = infraSummary([], today);
    expect(empty.monthlyEquivalentCents).toBe(0);
    expect(empty.total).toBe(0);
    expect(empty.renewals.expired.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/domain/analytics/portfolio.test.ts src/domain/analytics/infra.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/domain/analytics/portfolio.ts`:

```ts
import { diffDays } from "../dates";
import { inRange } from "./common";

export type Stage = "COTIZACION" | "EN_DESARROLLO" | "ENTREGADO" | "EN_MANTENIMIENTO";
export const STAGES: Stage[] = ["COTIZACION", "EN_DESARROLLO", "ENTREGADO", "EN_MANTENIMIENTO"];

export interface PortfolioProject {
  clientId: string;
  stage: Stage;
  contractType: "PAGO_UNICO" | "SUSCRIPCION";
  totalCents: number | null;
  monthlyFeeCents: number | null;
  createdAt: Date;
  startedAt: Date | null;
  deliveredAt: Date | null;
  /** Tiene una suscripción activa o un mantenimiento activo. */
  activeRecurring: boolean;
}

export interface PortfolioClient {
  id: string;
  name: string;
  createdAt: Date;
  /** Cobrado acumulado histórico del cliente. */
  collectedCents: number;
}

export function projectsSummary(projects: PortfolioProject[], from: Date, to: Date) {
  const byStage = STAGES.map((stage) => {
    const ps = projects.filter((p) => p.stage === stage);
    return {
      stage,
      count: ps.length,
      contractedCents: ps.filter((p) => p.contractType === "PAGO_UNICO").reduce((s, p) => s + (p.totalCents ?? 0), 0),
      monthlyCents: ps.filter((p) => p.contractType === "SUSCRIPCION").reduce((s, p) => s + (p.monthlyFeeCents ?? 0), 0),
    };
  });
  const delivered = projects.filter((p) => p.deliveredAt !== null && inRange(p.deliveredAt, from, to));
  const withDuration = delivered.filter((p) => p.startedAt !== null);
  const totalDays = withDuration.reduce((s, p) => s + diffDays(p.deliveredAt as Date, p.startedAt as Date), 0);
  return {
    byStage,
    created: projects.filter((p) => inRange(p.createdAt, from, to)).length,
    delivered: delivered.length,
    avgDevDays: withDuration.length === 0 ? null : totalDays / withDuration.length,
  };
}

export function clientsSummary(clients: PortfolioClient[], projects: PortfolioProject[], from: Date, to: Date) {
  const active = new Set(
    projects
      .filter((p) => p.stage === "EN_DESARROLLO" || p.stage === "EN_MANTENIMIENTO" || p.activeRecurring)
      .map((p) => p.clientId),
  );
  return {
    total: clients.length,
    newInPeriod: clients.filter((c) => inRange(c.createdAt, from, to)).length,
    withActiveWork: clients.filter((c) => active.has(c.id)).length,
    top: clients
      .filter((c) => c.collectedCents > 0)
      .sort((a, b) => b.collectedCents - a.collectedCents || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((c) => ({ id: c.id, name: c.name, cents: c.collectedCents })),
  };
}
```

`src/domain/analytics/infra.ts`:

```ts
import { diffDays } from "../dates";

export type AssetType = "DOMINIO" | "HOSTING" | "SERVIDOR";
const TYPES: AssetType[] = ["DOMINIO", "HOSTING", "SERVIDOR"];

export interface InfraAsset {
  id: string;
  type: AssetType;
  identifier: string;
  projectName: string;
  managedByNaro: boolean;
  costCents: number | null;
  costEveryMonths: number;
  renewalDate: Date;
}

export interface Renewal {
  id: string;
  type: AssetType;
  identifier: string;
  projectName: string;
  renewalDate: Date;
  managedByNaro: boolean;
  costCents: number | null;
}

export interface RenewalGroup {
  items: Renewal[];
  /** Costo de las renovaciones que paga Naro. */
  costCents: number;
}

const toRenewal = (a: InfraAsset): Renewal => ({
  id: a.id,
  type: a.type,
  identifier: a.identifier,
  projectName: a.projectName,
  renewalDate: a.renewalDate,
  managedByNaro: a.managedByNaro,
  costCents: a.costCents,
});

function group(assets: InfraAsset[]): RenewalGroup {
  const items = [...assets].sort((a, b) => a.renewalDate.getTime() - b.renewalDate.getTime()).map(toRenewal);
  const costCents = items.reduce((s, r) => s + (r.managedByNaro && r.costCents ? r.costCents : 0), 0);
  return { items, costCents };
}

export function infraSummary(assets: InfraAsset[], today: Date) {
  const monthlyEquivalentCents = assets.reduce(
    (s, a) =>
      a.managedByNaro && a.costCents && a.costCents > 0 && Number.isFinite(a.costEveryMonths) && a.costEveryMonths >= 1
        ? s + Math.round(a.costCents / a.costEveryMonths)
        : s,
    0,
  );
  const daysTo = (a: InfraAsset) => diffDays(a.renewalDate, today);
  return {
    monthlyEquivalentCents,
    total: assets.length,
    byType: TYPES.map((type) => ({
      type,
      naro: assets.filter((a) => a.type === type && a.managedByNaro).length,
      client: assets.filter((a) => a.type === type && !a.managedByNaro).length,
    })),
    renewals: {
      expired: group(assets.filter((a) => daysTo(a) < 0)),
      next30: group(assets.filter((a) => daysTo(a) >= 0 && daysTo(a) <= 30)),
      next60: group(assets.filter((a) => daysTo(a) >= 31 && daysTo(a) <= 60)),
      next90: group(assets.filter((a) => daysTo(a) >= 61 && daysTo(a) <= 90)),
    },
  };
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test src/domain/analytics/portfolio.test.ts src/domain/analytics/infra.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/analytics/portfolio.ts src/domain/analytics/portfolio.test.ts src/domain/analytics/infra.ts src/domain/analytics/infra.test.ts
git commit -m "feat(analíticas): métricas de proyectos, clientes e infraestructura"
```

---

### Task 8: Hechos, composición por pestaña y carga de datos

**Files:**
- Create: `src/domain/analytics/facts.ts`, `src/domain/analytics/build.ts`, `src/server/analytics/queries.ts`
- Test: `src/domain/analytics/build.test.ts`

**Interfaces:**
- Consumes: todo lo producido en las Tasks 2–7; `todayAR` (`src/domain/dates.ts`); `serviceStatus` (`src/domain/status.ts`); `decToCents` (`src/server/mappers.ts`); `prisma`.
- Produces:

```ts
// facts.ts
export interface Facts {
  today: Date;
  payments: FinancePayment[];
  installments: CollectionInstallment[];      // también cumple FinanceInstallment
  contracts: RecurringContract[];
  proposals: SalesProposal[];
  projects: PortfolioProject[];
  clients: PortfolioClient[];
  assets: InfraAsset[];                        // también cumple FinanceAsset
}
// build.ts  (todas puras; key = PeriodKey)
buildFinance(f: Facts, key): { current: Period; previous: Period; cur; prev; variations: { collected; projected; infraCost; net }; series: SeriesPoint[]; topClients: TopEntry[]; topProjects: TopEntry[]; concentrationPct: number | null }
buildCollections(f, key): { current; previous; aging; punctuality; previousPunctuality; debt; debtors }
buildRecurring(f, key): { current; previous; cur; prev; series: { label; from; cents }[]; hasAny: boolean }
buildSales(f, key): { current; previous; cur; prev }
buildPortfolio(f, key): { current; previous; projects; previousProjects; clients }
buildInfra(f): ReturnType<typeof infraSummary>
// queries.ts
export async function loadFacts(now?: Date): Promise<Facts>   // server-only
```

- [ ] **Step 1: Escribir el test que falla**

`src/domain/analytics/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseDateInput as d } from "../dates";
import { buildCollections, buildFinance, buildInfra, buildPortfolio, buildRecurring, buildSales } from "./build";
import type { Facts } from "./facts";

const facts: Facts = {
  today: d("2026-10-14"),
  payments: [
    { amountCents: 100, paidAt: d("2026-10-05"), method: "Transferencia", kind: "DESARROLLO", clientId: "c1", clientName: "Ana", projectId: "p1", projectName: "Web" },
    { amountCents: 40, paidAt: d("2026-09-10"), method: "Efectivo", kind: "SUSCRIPCION", clientId: "c1", clientName: "Ana", projectId: "p1", projectName: "Web" },
    { amountCents: 60, paidAt: d("2026-07-01"), method: "Efectivo", kind: "MANTENIMIENTO", clientId: "c2", clientName: "Beto", projectId: "p2", projectName: "App" },
  ],
  installments: [
    { amountCents: 300, paidCents: 100, dueDate: d("2026-10-02"), lastPaidAt: d("2026-10-05"), clientId: "c1", clientName: "Ana" },
    { amountCents: 100, paidCents: 100, dueDate: d("2026-10-01"), lastPaidAt: d("2026-10-01"), clientId: "c2", clientName: "Beto" },
  ],
  contracts: [{ kind: "SUSCRIPCION", feeCents: 400, status: "ACTIVO", startedAt: d("2026-10-02"), endedAt: null }],
  proposals: [
    { status: "ACEPTADA", createdAt: d("2026-10-01"), validUntil: null, oneTimePriceCents: 1000, project: { createdAt: d("2026-10-04"), contractType: "PAGO_UNICO", totalCents: 900, monthlyFeeCents: null } },
    { status: "ENVIADA", createdAt: d("2026-09-20"), validUntil: null, oneTimePriceCents: 500, project: null },
  ],
  projects: [{ clientId: "c1", stage: "EN_DESARROLLO", contractType: "PAGO_UNICO", totalCents: 900, monthlyFeeCents: null, createdAt: d("2026-10-04"), startedAt: d("2026-10-05"), deliveredAt: null, activeRecurring: false }],
  clients: [{ id: "c1", name: "Ana", createdAt: d("2026-10-03"), collectedCents: 140 }],
  assets: [{ id: "a1", type: "DOMINIO", identifier: "ana.com", projectName: "Web", managedByNaro: true, costCents: 3_652_500, costEveryMonths: 12, renewalDate: d("2026-10-20") }],
};

describe("buildFinance", () => {
  it("compara el período en curso con el anterior (mes)", () => {
    const r = buildFinance(facts, "mes");
    expect(r.cur.collectedCents).toBe(100);
    expect(r.prev.collectedCents).toBe(40);
    expect(r.variations.collected).toEqual({ diffCents: 60, pct: 1.5 });
    expect(r.series).toHaveLength(31);
    expect(r.topClients[0]).toMatchObject({ id: "c1", cents: 100 });
    expect(r.concentrationPct).toBeCloseTo(1, 6);
  });

  it("6 meses abarca los cobros de julio a octubre", () => {
    const r = buildFinance(facts, "6m");
    expect(r.cur.collectedCents).toBe(200);
    expect(r.series).toHaveLength(6);
  });
});

describe("buildCollections", () => {
  it("antigüedad, deuda y puntualidad del período", () => {
    const r = buildCollections(facts, "mes");
    expect(r.debt.totalCents).toBe(200);
    expect(r.aging.find((b) => b.key === "8-30")?.cents).toBe(200);
    expect(r.punctuality.count).toBe(1); // la cuota de 100 pagada el 01/10
    expect(r.punctuality.onTimePct).toBe(1);
    expect(r.debtors[0]).toMatchObject({ clientId: "c1", overdueCents: 200 });
  });
});

describe("buildRecurring", () => {
  it("MRR, altas y serie de los últimos 12 meses", () => {
    const r = buildRecurring(facts, "mes");
    expect(r.cur.mrr.totalCents).toBe(400);
    expect(r.cur.signups).toBe(1);
    expect(r.series).toHaveLength(12);
    expect(r.series.reduce((s, x) => s + x.cents, 0)).toBe(100); // 40 (sep) + 60 (jul); el de DESARROLLO no cuenta
    expect(r.hasAny).toBe(true);
  });
});

describe("buildSales / buildPortfolio / buildInfra", () => {
  it("ventas del mes y del anterior", () => {
    const r = buildSales(facts, "mes");
    expect(r.cur.created).toBe(1);
    expect(r.prev.created).toBe(1);
    expect(r.cur.pipeline.count).toBe(1);
  });

  it("proyectos y clientes del período", () => {
    const r = buildPortfolio(facts, "mes");
    expect(r.projects.created).toBe(1);
    expect(r.clients.newInPeriod).toBe(1);
    expect(r.clients.withActiveWork).toBe(1);
  });

  it("infraestructura", () => {
    const r = buildInfra(facts);
    expect(r.monthlyEquivalentCents).toBe(Math.round(3_652_500 / 12));
    expect(r.renewals.next30.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test src/domain/analytics/build.test.ts`
Expected: FAIL (`Cannot find module './build'`).

- [ ] **Step 3: Implementar los hechos y la composición**

`src/domain/analytics/facts.ts`:

```ts
import type { CollectionInstallment } from "./collections";
import type { FinancePayment } from "./finance";
import type { InfraAsset } from "./infra";
import type { PortfolioClient, PortfolioProject } from "./portfolio";
import type { RecurringContract } from "./recurring";
import type { SalesProposal } from "./sales";

/** Todo lo que necesitan las analíticas, ya en centavos y con fechas; la carga la hace `src/server/analytics/queries.ts`. */
export interface Facts {
  today: Date;
  payments: FinancePayment[];
  installments: CollectionInstallment[];
  contracts: RecurringContract[];
  proposals: SalesProposal[];
  projects: PortfolioProject[];
  clients: PortfolioClient[];
  assets: InfraAsset[];
}
```

`src/domain/analytics/build.ts`:

```ts
import { agingBuckets, debtSummary, debtorsByClient, punctuality } from "./collections";
import type { Facts } from "./facts";
import { financeSeries, financeSummary, topCollected, topShare } from "./finance";
import { infraSummary } from "./infra";
import { clientsSummary, projectsSummary } from "./portfolio";
import { bucketsOf, resolvePeriod, variation, type PeriodKey } from "./period";
import { recurringCollectedSeries, recurringSummary } from "./recurring";
import { salesSummary } from "./sales";

export function buildFinance(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  const input = { payments: f.payments, installments: f.installments, assets: f.assets };
  const cur = financeSummary(input, current.from, current.to, f.today);
  const prev = financeSummary(input, previous.from, previous.to, f.today);
  return {
    current,
    previous,
    cur,
    prev,
    variations: {
      collected: variation(cur.collectedCents, prev.collectedCents),
      projected: variation(cur.projectedCents, prev.projectedCents),
      infraCost: variation(cur.infraCostCents, prev.infraCostCents),
      net: variation(cur.netCents, prev.netCents),
    },
    series: financeSeries(input, bucketsOf(current), f.today),
    topClients: topCollected(f.payments, current.from, current.to, "client"),
    topProjects: topCollected(f.payments, current.from, current.to, "project"),
    concentrationPct: topShare(f.payments, current.from, current.to, 3),
  };
}

export function buildCollections(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  return {
    current,
    previous,
    aging: agingBuckets(f.installments, f.today),
    punctuality: punctuality(f.installments, current.from, current.to),
    previousPunctuality: punctuality(f.installments, previous.from, previous.to),
    debt: debtSummary(f.installments, f.today),
    debtors: debtorsByClient(f.installments, f.today),
  };
}

export function buildRecurring(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  const lastYear = resolvePeriod("1a", f.today).current;
  return {
    current,
    previous,
    cur: recurringSummary(f.contracts, current.from, current.to),
    prev: recurringSummary(f.contracts, previous.from, previous.to),
    series: recurringCollectedSeries(f.payments, bucketsOf(lastYear)),
    hasAny: f.contracts.length > 0,
  };
}

export function buildSales(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  return {
    current,
    previous,
    cur: salesSummary(f.proposals, current.from, current.to, f.today),
    prev: salesSummary(f.proposals, previous.from, previous.to, f.today),
  };
}

export function buildPortfolio(f: Facts, key: PeriodKey) {
  const { current, previous } = resolvePeriod(key, f.today);
  return {
    current,
    previous,
    projects: projectsSummary(f.projects, current.from, current.to),
    previousProjects: projectsSummary(f.projects, previous.from, previous.to),
    clients: clientsSummary(f.clients, f.projects, current.from, current.to),
  };
}

export const buildInfra = (f: Facts) => infraSummary(f.assets, f.today);
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test src/domain/analytics/build.test.ts`
Expected: PASS. (Si falla `r.series.reduce(...) === 100`, revisar que el rango de "1 año" incluya julio de 2026 y septiembre de 2026, que es el caso; el pago de `DESARROLLO` no debe contar.)

- [ ] **Step 5: Implementar la carga de datos**

`src/server/analytics/queries.ts`:

```ts
import "server-only";
import type { Facts } from "@/domain/analytics/facts";
import { todayAR } from "@/domain/dates";
import { serviceStatus } from "@/domain/status";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

/** Carga una vez todos los datos que usan las analíticas y los mapea a centavos y fechas (los cálculos son del dominio). */
export async function loadFacts(now: Date = new Date()): Promise<Facts> {
  const today = todayAR(now);
  const [installments, projects, proposals, clients, assets] = await Promise.all([
    prisma.installment.findMany({
      include: {
        payments: true,
        plan: {
          select: {
            kind: true,
            project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.project.findMany({
      include: {
        plans: {
          select: {
            kind: true,
            createdAt: true,
            installments: { select: { amount: true, dueDate: true, payments: { select: { amount: true } } } },
          },
        },
      },
    }),
    prisma.proposal.findMany({
      include: { project: { select: { createdAt: true, contractType: true, totalAmount: true, monthlyFee: true } } },
    }),
    prisma.client.findMany({ select: { id: true, name: true, createdAt: true } }),
    prisma.infrastructureAsset.findMany({ include: { project: { select: { name: true } } } }),
  ]);

  const payments: Facts["payments"] = [];
  const instFacts: Facts["installments"] = [];
  const collectedByClient = new Map<string, number>();
  for (const i of installments) {
    const { project } = i.plan;
    let paidCents = 0;
    let lastPaidAt: Date | null = null;
    for (const p of i.payments) {
      const cents = decToCents(p.amount);
      paidCents += cents;
      if (!lastPaidAt || p.paidAt.getTime() > lastPaidAt.getTime()) lastPaidAt = p.paidAt;
      payments.push({
        amountCents: cents,
        paidAt: p.paidAt,
        method: p.method,
        kind: i.plan.kind,
        clientId: project.client.id,
        clientName: project.client.name,
        projectId: project.id,
        projectName: project.name,
      });
      collectedByClient.set(project.client.id, (collectedByClient.get(project.client.id) ?? 0) + cents);
    }
    instFacts.push({
      amountCents: decToCents(i.amount),
      paidCents,
      dueDate: i.dueDate,
      lastPaidAt,
      clientId: project.client.id,
      clientName: project.client.name,
    });
  }

  const contracts: Facts["contracts"] = [];
  const activeRecurring = new Set<string>();
  for (const p of projects) {
    const sub = p.plans.find((pl) => pl.kind === "SUSCRIPCION");
    if (sub && p.monthlyFee) {
      const status = serviceStatus(
        {
          suspended: p.serviceSuspended,
          installments: sub.installments.map((i) => ({
            amountCents: decToCents(i.amount),
            paidCents: i.payments.reduce((s, x) => s + decToCents(x.amount), 0),
            dueDate: i.dueDate,
          })),
        },
        today,
      );
      contracts.push({ kind: "SUSCRIPCION", feeCents: decToCents(p.monthlyFee), status, startedAt: sub.createdAt, endedAt: null });
      if (status === "ACTIVO") activeRecurring.add(p.id);
    }
    const maint = p.plans.find((pl) => pl.kind === "MANTENIMIENTO");
    if (maint && p.maintenanceFee) {
      const ended = p.maintenanceEndedAt !== null;
      contracts.push({
        kind: "MANTENIMIENTO",
        feeCents: decToCents(p.maintenanceFee),
        status: ended ? "FINALIZADO" : "ACTIVO",
        startedAt: maint.createdAt,
        endedAt: p.maintenanceEndedAt,
      });
      if (!ended) activeRecurring.add(p.id);
    }
  }

  return {
    today,
    payments,
    installments: instFacts,
    contracts,
    proposals: proposals.map((p) => ({
      status: p.status,
      createdAt: p.createdAt,
      validUntil: p.validUntil,
      oneTimePriceCents: decToCents(p.oneTimePrice),
      project: p.project
        ? {
            createdAt: p.project.createdAt,
            contractType: p.project.contractType,
            totalCents: p.project.totalAmount ? decToCents(p.project.totalAmount) : null,
            monthlyFeeCents: p.project.monthlyFee ? decToCents(p.project.monthlyFee) : null,
          }
        : null,
    })),
    projects: projects.map((p) => ({
      clientId: p.clientId,
      stage: p.stage,
      contractType: p.contractType,
      totalCents: p.totalAmount ? decToCents(p.totalAmount) : null,
      monthlyFeeCents: p.monthlyFee ? decToCents(p.monthlyFee) : null,
      createdAt: p.createdAt,
      startedAt: p.startedAt,
      deliveredAt: p.deliveredAt,
      activeRecurring: activeRecurring.has(p.id),
    })),
    clients: clients.map((c) => ({ id: c.id, name: c.name, createdAt: c.createdAt, collectedCents: collectedByClient.get(c.id) ?? 0 })),
    assets: assets.map((a) => ({
      id: a.id,
      type: a.type,
      identifier: a.identifier,
      projectName: a.project.name,
      managedByNaro: a.managedByNaro,
      costCents: a.costAmount ? decToCents(a.costAmount) : null,
      costEveryMonths: a.costEveryMonths,
      renewalDate: a.renewalDate,
    })),
  };
}
```

- [ ] **Step 6: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: sin errores ni advertencias; todos los tests pasan.

- [ ] **Step 7: Commit**

```bash
git add src/domain/analytics/facts.ts src/domain/analytics/build.ts src/domain/analytics/build.test.ts src/server/analytics/queries.ts
git commit -m "feat(analíticas): hechos, composición por pestaña y carga de datos"
```

---

### Task 9: Pantalla base, componentes compartidos y pestaña Finanzas

**Files:**
- Create: `src/components/analytics/sections.ts`, `kpi.tsx`, `block.tsx`, `simple-table.tsx`, `bar-chart.tsx`, `selectors.tsx`, `finance-section.tsx`
- Create: `src/app/(admin)/analytics/page.tsx`
- Modify: `src/components/admin-nav.tsx`
- Test: `src/components/analytics/sections.test.ts`

**Interfaces:**
- Consumes: `buildFinance`, `loadFacts`, `parsePeriodKey`, `PERIOD_KEYS`, `PERIOD_LABEL`, `periodRangeLabel`, `formatARS`, `formatPct`, `formatSignedARS`, `formatSignedPct`, `formatCompactARS`.
- Produces: `SECTIONS`, `SectionKey`, `parseSectionKey`; componentes `Kpi`, `KpiGrid`, `Block`, `SimpleTable`, `BarChart`, `PeriodSelector`, `SectionTabs`, `FinanceSection`; la ruta `/analytics?periodo=&seccion=`. Las pestañas aún no implementadas muestran un aviso hasta las Tasks 10 y 11.

- [ ] **Step 1: Escribir el test que falla**

`src/components/analytics/sections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SECTIONS, parseSectionKey } from "./sections";

describe("parseSectionKey", () => {
  it("usa 'finanzas' por defecto y ante valores inválidos", () => {
    expect(parseSectionKey(undefined)).toBe("finanzas");
    expect(parseSectionKey("otra-cosa")).toBe("finanzas");
  });

  it("acepta las seis pestañas", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(["finanzas", "cobranza", "recurrente", "ventas", "proyectos", "infra"]);
    for (const s of SECTIONS) expect(parseSectionKey(s.key)).toBe(s.key);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test src/components/analytics/sections.test.ts`
Expected: FAIL (`Cannot find module './sections'`).

- [ ] **Step 3: Implementar constantes, tarjetas, bloques, tablas y gráfico**

`src/components/analytics/sections.ts`:

```ts
export const SECTIONS = [
  { key: "finanzas", label: "Finanzas" },
  { key: "cobranza", label: "Cobranza" },
  { key: "recurrente", label: "Recurrente" },
  { key: "ventas", label: "Ventas" },
  { key: "proyectos", label: "Proyectos y clientes" },
  { key: "infra", label: "Infraestructura" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

export const parseSectionKey = (value: string | undefined): SectionKey =>
  SECTIONS.find((s) => s.key === value)?.key ?? "finanzas";
```

`src/components/analytics/kpi.tsx`:

```tsx
import { formatSignedARS, formatSignedPct } from "@/lib/format";

export interface Delta {
  diffCents: number;
  pct: number | null;
}

function DeltaLine({ delta, positiveIsGood }: { delta: Delta; positiveIsGood: boolean }) {
  if (delta.diffCents === 0) {
    return <p className="mt-1 text-xs text-muted-foreground">Sin cambios vs. período anterior</p>;
  }
  const good = delta.diffCents > 0 === positiveIsGood;
  return (
    <p className={`mt-1 text-xs ${good ? "text-emerald-700" : "text-red-700"}`}>
      {formatSignedARS(delta.diffCents)}
      {delta.pct !== null && ` (${formatSignedPct(delta.pct)})`} vs. período anterior
    </p>
  );
}

/** Tarjeta de indicador. `tone="alert"` pinta el valor en rojo (por ejemplo un balance negativo). */
export function Kpi({
  label,
  value,
  hint,
  delta,
  positiveIsGood = true,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: Delta;
  positiveIsGood?: boolean;
  tone?: "alert";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${tone === "alert" ? "text-red-700" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {delta && <DeltaLine delta={delta} positiveIsGood={positiveIsGood} />}
    </div>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}
```

`src/components/analytics/block.tsx`:

```tsx
export function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{title}</h2>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{children}</p>;
}
```

`src/components/analytics/simple-table.tsx`:

```tsx
export function SimpleTable({
  headers,
  rows,
  empty = "Sin datos para este período.",
}: {
  headers: { label: string; right?: boolean }[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left">
          <tr>
            {headers.map((h) => (
              <th key={h.label} className={`p-2 font-medium ${h.right ? "text-right" : ""}`}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} className="p-3 text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((cells, r) => (
            <tr key={r} className="border-t">
              {cells.map((cell, c) => (
                <td key={c} className={`p-2 ${headers[c]?.right ? "text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/analytics/bar-chart.tsx`:

```tsx
import { formatARS } from "@/domain/money";
import { formatCompactARS } from "@/lib/format";

export interface BarDatum {
  label: string;
  a: number;
  b?: number;
}

const COLOR_A = "#1E56F0";
const COLOR_B = "#B6C9FB";

/** Barras agrupadas en SVG. Cada barra lleva su valor en un <title>; el detalle completo va también en una tabla aparte. */
export function BarChart({
  data,
  labelA,
  labelB,
  ariaLabel,
}: {
  data: BarDatum[];
  labelA: string;
  labelB?: string;
  ariaLabel: string;
}) {
  const W = 720;
  const H = 240;
  const left = 56;
  const right = 8;
  const top = 12;
  const bottom = 28;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const n = Math.max(1, data.length);
  const groupW = plotW / n;
  const hasB = labelB !== undefined;
  const barW = Math.max(2, Math.min(28, (groupW * 0.7) / (hasB ? 2 : 1)));
  const labelEvery = Math.ceil(n / 12);
  const y = (v: number) => top + plotH - (v / max) * plotH;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_A }} aria-hidden />
          {labelA}
        </span>
        {hasB && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: COLOR_B }} aria-hidden />
            {labelB}
          </span>
        )}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(max * t)} y2={y(max * t)} stroke="#E6EAF1" />
            <text x={left - 6} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="#6E7786">
              {formatCompactARS(max * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = left + groupW * i + groupW / 2;
          const x0 = hasB ? cx - barW : cx - barW / 2;
          return (
            <g key={`${d.label}-${i}`}>
              <rect x={x0} y={y(d.a)} width={barW} height={Math.max(0, top + plotH - y(d.a))} rx={2} fill={COLOR_A}>
                <title>{`${d.label}: ${labelA} ${formatARS(d.a)}`}</title>
              </rect>
              {hasB && (
                <rect x={cx} y={y(d.b ?? 0)} width={barW} height={Math.max(0, top + plotH - y(d.b ?? 0))} rx={2} fill={COLOR_B}>
                  <title>{`${d.label}: ${labelB} ${formatARS(d.b ?? 0)}`}</title>
                </rect>
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="#6E7786">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
```

`src/components/analytics/selectors.tsx`:

```tsx
import Link from "next/link";
import { PERIOD_KEYS, PERIOD_LABEL, type PeriodKey } from "@/domain/analytics/period";
import { SECTIONS, type SectionKey } from "./sections";

const base = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";
const on = "bg-primary text-primary-foreground";
const off = "bg-card text-foreground hover:bg-accent border";

export function PeriodSelector({ periodo, seccion }: { periodo: PeriodKey; seccion: SectionKey }) {
  return (
    <nav aria-label="Período" className="flex flex-wrap gap-2">
      {PERIOD_KEYS.map((k) => (
        <Link
          key={k}
          href={`/analytics?periodo=${k}&seccion=${seccion}`}
          aria-current={k === periodo ? "page" : undefined}
          className={`${base} ${k === periodo ? on : off}`}
        >
          {PERIOD_LABEL[k]}
        </Link>
      ))}
    </nav>
  );
}

export function SectionTabs({ periodo, seccion }: { periodo: PeriodKey; seccion: SectionKey }) {
  return (
    <nav aria-label="Sección" className="flex flex-wrap gap-1 border-b">
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={`/analytics?periodo=${periodo}&seccion=${s.key}`}
          aria-current={s.key === seccion ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            s.key === seccion ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Implementar la pestaña Finanzas**

`src/components/analytics/finance-section.tsx`:

```tsx
import type { buildFinance } from "@/domain/analytics/build";
import { periodRangeLabel } from "@/domain/analytics/period";
import { formatARS } from "@/domain/money";
import { formatPct } from "@/lib/format";
import { BarChart } from "./bar-chart";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildFinance>;

export function FinanceSection({ d }: { d: Data }) {
  const { cur, variations: v, series } = d;
  const origins = [
    { label: "Proyectos únicos", cents: cur.byKind.oneTimeCents },
    { label: "Suscripciones", cents: cur.byKind.subscriptionCents },
    { label: "Mantenimiento", cents: cur.byKind.maintenanceCents },
  ].filter((o) => o.cents > 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        {periodRangeLabel(d.current)} · período en curso: se compara contra el período anterior completo ({periodRangeLabel(d.previous)}).
      </p>

      <KpiGrid>
        <Kpi label="Cobrado" value={formatARS(cur.collectedCents)} hint="Dinero que entró en el período" delta={v.collected} />
        <Kpi label="Proyectado" value={formatARS(cur.projectedCents)} hint="Cuotas que vencían en el período" delta={v.projected} />
        <Kpi label="Cumplimiento" value={formatPct(cur.fulfillmentPct)} hint="De lo proyectado, cuánto ya está cobrado" />
        <Kpi label="Por cobrar" value={formatARS(cur.upcomingCents)} hint="Cuotas del período que todavía no vencen" />
        <Kpi label="Vencido sin cobrar" value={formatARS(cur.overdueCents)} hint="Cuotas del período ya vencidas" tone={cur.overdueCents > 0 ? "alert" : undefined} />
        <Kpi label="Costos de infraestructura" value={formatARS(cur.infraCostCents)} hint="Repartidos en el tiempo" delta={v.infraCost} positiveIsGood={false} />
        <Kpi
          label="Balance neto"
          value={formatARS(cur.netCents)}
          hint="Cobrado menos costos de infraestructura"
          delta={v.net}
          tone={cur.netCents < 0 ? "alert" : undefined}
        />
      </KpiGrid>

      <Block title="Cobrado vs. proyectado" note="Cada tramo muestra lo cobrado y lo que vencía en él; el detalle completo está en la tabla.">
        <BarChart
          data={series.map((s) => ({ label: s.label, a: s.collectedCents, b: s.projectedCents }))}
          labelA="Cobrado"
          labelB="Proyectado"
          ariaLabel={`Cobrado y proyectado, ${periodRangeLabel(d.current)}`}
        />
        <SimpleTable
          headers={[
            { label: "Tramo" },
            { label: "Cobrado", right: true },
            { label: "Proyectado", right: true },
            { label: "Costos", right: true },
            { label: "Neto", right: true },
          ]}
          rows={series.map((s) => [
            s.label,
            formatARS(s.collectedCents),
            formatARS(s.projectedCents),
            formatARS(s.costCents),
            <span key="n" className={s.netCents < 0 ? "text-red-700" : ""}>
              {formatARS(s.netCents)}
            </span>,
          ])}
        />
      </Block>

      {origins.length > 0 && (
        <Block title="Cobrado por origen">
          <SimpleTable
            headers={[{ label: "Origen" }, { label: "Cobrado", right: true }, { label: "% del total", right: true }]}
            rows={origins.map((o) => [o.label, formatARS(o.cents), formatPct(o.cents / cur.collectedCents)])}
          />
        </Block>
      )}

      {cur.byMethod.length > 0 && (
        <Block title="Cobrado por método de pago">
          <SimpleTable
            headers={[{ label: "Método" }, { label: "Cobrado", right: true }, { label: "% del total", right: true }]}
            rows={cur.byMethod.map((m) => [m.method, formatARS(m.cents), formatPct(m.cents / cur.collectedCents)])}
          />
        </Block>
      )}

      <Block
        title="Quiénes aportan más"
        note={
          d.concentrationPct === null
            ? undefined
            : `Los 3 primeros clientes concentran el ${formatPct(d.concentrationPct)} de lo cobrado.`
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <SimpleTable
            headers={[{ label: "Cliente" }, { label: "Cobrado", right: true }, { label: "%", right: true }]}
            rows={d.topClients.map((t) => [t.name, formatARS(t.cents), formatPct(t.sharePct)])}
            empty="Sin cobros en el período."
          />
          <SimpleTable
            headers={[{ label: "Proyecto" }, { label: "Cobrado", right: true }, { label: "%", right: true }]}
            rows={d.topProjects.map((t) => [t.name, formatARS(t.cents), formatPct(t.sharePct)])}
            empty="Sin cobros en el período."
          />
        </div>
      </Block>
    </div>
  );
}
```

- [ ] **Step 5: Implementar la página y la entrada de menú**

`src/app/(admin)/analytics/page.tsx` (las pestañas de las Tasks 10 y 11 se enchufan en el `switch`; hasta entonces muestran un aviso):

```tsx
import { connection } from "next/server";
import { buildFinance } from "@/domain/analytics/build";
import { parsePeriodKey } from "@/domain/analytics/period";
import { loadFacts } from "@/server/analytics/queries";
import { FinanceSection } from "@/components/analytics/finance-section";
import { EmptyNote } from "@/components/analytics/block";
import { PeriodSelector, SectionTabs } from "@/components/analytics/selectors";
import { parseSectionKey } from "@/components/analytics/sections";

// Lee la base y la hora en cada visita: la ruta bloquea en el servidor (opt-out documentado de Next 16).
export const instant = false;
export const metadata = { title: "Analíticas — Grupo Naro" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; seccion?: string }>;
}) {
  await connection();
  const sp = await searchParams;
  const periodo = parsePeriodKey(sp.periodo);
  const seccion = parseSectionKey(sp.seccion);
  const facts = await loadFacts();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Analíticas</h1>
      <PeriodSelector periodo={periodo} seccion={seccion} />
      <SectionTabs periodo={periodo} seccion={seccion} />
      {seccion === "finanzas" ? (
        <FinanceSection d={buildFinance(facts, periodo)} />
      ) : (
        <EmptyNote>Esta pestaña todavía no está disponible.</EmptyNote>
      )}
    </div>
  );
}
```

En `src/components/admin-nav.tsx`, agregar la entrada justo después de Dashboard:

```tsx
  { href: "/dashboard", label: "Dashboard" },
  { href: "/analytics", label: "Analíticas" },
```

- [ ] **Step 6: Ejecutar tests y verificar**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: todo pasa, sin advertencias; el build lista la ruta `/analytics` como dinámica (`ƒ`).

Verificación funcional (producción local en un puerto libre; login con Playwright usando `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; leer credenciales de `.env` sin imprimirlas; no tocar el `next dev` del usuario en el 3000):
1. `/analytics` sin sesión redirige a `/login`.
2. Con sesión: `/analytics`, `/analytics?periodo=semana`, `?periodo=6m`, `?periodo=1a` y `?seccion=finanzas` responden 200, sin los textos `NaN`, `Infinity` ni `undefined` en el `main`.
3. Con un parámetro inválido (`?periodo=xx&seccion=yy`) muestra Mes y Finanzas.
4. El enlace "Analíticas" aparece en la barra lateral y queda activo en `/analytics`.
5. Sacar una captura de escritorio y otra de 390 px de ancho, y confirmar que no hay desbordamiento horizontal de la página.

- [ ] **Step 7: Commit**

```bash
git add src/components/analytics src/app/\(admin\)/analytics src/components/admin-nav.tsx
git commit -m "feat(analíticas): pantalla con selector de período y pestaña Finanzas"
```

---

### Task 10: Pestañas Cobranza y Recurrente

**Files:**
- Create: `src/components/analytics/collections-section.tsx`, `src/components/analytics/recurring-section.tsx`
- Modify: `src/app/(admin)/analytics/page.tsx`

**Interfaces:**
- Consumes: `buildCollections`, `buildRecurring`; componentes de la Task 9; `formatDays`, `formatPct`, `formatARS`, `formatDate`.
- Produces: `CollectionsSection({ d })`, `RecurringSection({ d })`; el `switch` de la página atiende `cobranza` y `recurrente`.

- [ ] **Step 1: Implementar Cobranza**

`src/components/analytics/collections-section.tsx`:

```tsx
import type { buildCollections } from "@/domain/analytics/build";
import { periodRangeLabel } from "@/domain/analytics/period";
import { formatARS } from "@/domain/money";
import { formatDays, formatPct } from "@/lib/format";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildCollections>;

export function CollectionsSection({ d }: { d: Data }) {
  const overdueTotal = d.aging.reduce((s, b) => s + b.cents, 0);
  const overdueCount = d.aging.reduce((s, b) => s + b.count, 0);
  const p = d.punctuality;
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Deuda total de clientes" value={formatARS(d.debt.totalCents)} hint="Hoy · saldo de todas las cuotas" />
        <Kpi label="Vence en los próximos 30 días" value={formatARS(d.debt.dueNext30Cents)} hint="Hoy · incluye lo que vence hoy" />
        <Kpi
          label="Vencido sin cobrar"
          value={formatARS(overdueTotal)}
          hint={`Hoy · ${overdueCount} ${overdueCount === 1 ? "cuota" : "cuotas"}`}
          tone={overdueTotal > 0 ? "alert" : undefined}
        />
        <Kpi
          label="Pagadas a tiempo"
          value={formatPct(p.onTimePct)}
          hint={
            p.count === 0
              ? `Sin cuotas pagadas en ${periodRangeLabel(d.current)}`
              : `${p.count} ${p.count === 1 ? "cuota pagada" : "cuotas pagadas"} en el período · antes: ${formatPct(d.previousPunctuality.onTimePct)}`
          }
        />
        {p.avgLateDays !== null && (
          <Kpi label="Demora promedio" value={formatDays(p.avgLateDays)} hint="Solo de las cuotas que se pagaron tarde" />
        )}
      </KpiGrid>

      <Block title="Antigüedad de lo vencido" note="Hoy. Los días se cuentan desde el vencimiento de cada cuota con saldo.">
        <SimpleTable
          headers={[{ label: "Atraso" }, { label: "Cuotas", right: true }, { label: "Saldo vencido", right: true }]}
          rows={d.aging.map((b) => [b.label, String(b.count), formatARS(b.cents)])}
        />
      </Block>

      <Block title="Clientes con deuda vencida" note="Ordenados por saldo vencido.">
        <SimpleTable
          headers={[
            { label: "Cliente" },
            { label: "Cuotas vencidas", right: true },
            { label: "Saldo vencido", right: true },
            { label: "Mayor atraso", right: true },
          ]}
          rows={d.debtors.map((c) => [c.clientName, String(c.overdueCount), formatARS(c.overdueCents), formatDays(c.maxDaysLate)])}
          empty="No hay clientes con deuda vencida."
        />
      </Block>
    </div>
  );
}
```

- [ ] **Step 2: Implementar Recurrente**

`src/components/analytics/recurring-section.tsx`:

```tsx
import type { buildRecurring } from "@/domain/analytics/build";
import { formatARS } from "@/domain/money";
import { BarChart } from "./bar-chart";
import { Block, EmptyNote } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildRecurring>;

export function RecurringSection({ d }: { d: Data }) {
  if (!d.hasAny) {
    return <EmptyNote>Todavía no hay suscripciones ni mantenimientos. Esta pestaña se completa cuando exista el primero.</EmptyNote>;
  }
  const { cur } = d;
  const origins = [
    { label: "Suscripciones", cents: cur.mrr.subscriptionCents, count: cur.subscriptions.active },
    { label: "Mantenimiento", cents: cur.mrr.maintenanceCents, count: cur.maintenance.active },
  ].filter((o) => o.count > 0);
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="MRR" value={formatARS(cur.mrr.totalCents)} hint="Hoy · ingreso mensual recurrente" />
        <Kpi label="ARR" value={formatARS(cur.arrCents)} hint="Hoy · MRR × 12" />
        <Kpi label="Contratos activos" value={String(cur.activeContracts)} hint="Hoy · suscripciones y mantenimientos" />
        {cur.avgPerContractCents !== null && (
          <Kpi label="Ingreso promedio por contrato" value={formatARS(cur.avgPerContractCents)} hint="MRR ÷ contratos activos" />
        )}
        <Kpi label="Altas del período" value={String(cur.signups)} hint={`Período anterior: ${d.prev.signups}`} />
        {(cur.churnedMaintenance > 0 || d.prev.churnedMaintenance > 0) && (
          <Kpi
            label="Mantenimientos dados de baja"
            value={String(cur.churnedMaintenance)}
            hint={`Período anterior: ${d.prev.churnedMaintenance}`}
            tone={cur.churnedMaintenance > 0 ? "alert" : undefined}
          />
        )}
        {cur.subscriptions.overdue > 0 && (
          <Kpi label="Suscripciones vencidas" value={String(cur.subscriptions.overdue)} hint="Hoy · con una cuota vencida sin cobrar" tone="alert" />
        )}
        {cur.subscriptions.suspended > 0 && (
          <Kpi label="Suscripciones suspendidas" value={String(cur.subscriptions.suspended)} hint="Hoy · suspendidas manualmente" tone="alert" />
        )}
      </KpiGrid>

      {origins.length > 0 && (
        <Block title="MRR por origen">
          <SimpleTable
            headers={[{ label: "Origen" }, { label: "Contratos activos", right: true }, { label: "MRR", right: true }]}
            rows={origins.map((o) => [o.label, String(o.count), formatARS(o.cents)])}
          />
        </Block>
      )}

      <Block
        title="Ingreso recurrente cobrado por mes"
        note="Últimos 12 meses, sin importar el período elegido. Es lo cobrado en suscripciones y mantenimientos, no el MRR histórico."
      >
        <BarChart
          data={d.series.map((s) => ({ label: s.label, a: s.cents }))}
          labelA="Cobrado recurrente"
          ariaLabel="Ingreso recurrente cobrado por mes, últimos 12 meses"
        />
        <SimpleTable
          headers={[{ label: "Mes" }, { label: "Cobrado", right: true }]}
          rows={d.series.map((s) => [s.label, formatARS(s.cents)])}
        />
      </Block>
    </div>
  );
}
```

- [ ] **Step 3: Enchufar las pestañas en la página**

En `src/app/(admin)/analytics/page.tsx`: importar `buildCollections` y `buildRecurring` de `@/domain/analytics/build`, y `CollectionsSection` y `RecurringSection` de sus archivos; reemplazar la expresión condicional del cuerpo por un `switch` extraído a una función dentro del archivo:

```tsx
function renderSection(seccion: SectionKey, periodo: PeriodKey, facts: Facts) {
  switch (seccion) {
    case "finanzas":
      return <FinanceSection d={buildFinance(facts, periodo)} />;
    case "cobranza":
      return <CollectionsSection d={buildCollections(facts, periodo)} />;
    case "recurrente":
      return <RecurringSection d={buildRecurring(facts, periodo)} />;
    default:
      return <EmptyNote>Esta pestaña todavía no está disponible.</EmptyNote>;
  }
}
```

(con los imports de tipos `SectionKey` de `sections`, `PeriodKey` de `period` y `Facts` de `@/domain/analytics/facts`) y usar `{renderSection(seccion, periodo, facts)}` en el JSX.

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: todo pasa, sin advertencias.

Verificación funcional (como en la Task 9, base real y producción local): `?seccion=cobranza` y `?seccion=recurrente` con los cuatro períodos responden 200 sin `NaN`/`Infinity`/`undefined`; con la base sin suscripciones ni mantenimientos, Recurrente muestra el aviso vacío y no muestra tarjetas de MRR; con datos de prueba (tag `DEMOUI6`: una suscripción activa con cobros en los últimos meses, otra con una cuota vencida, un mantenimiento activo) aparecen las tarjetas correspondientes y las de "vencidas" y "suspendidas" solo cuando hay alguna. Borrar los datos de prueba y detener el servidor que hayas levantado.

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/collections-section.tsx src/components/analytics/recurring-section.tsx "src/app/(admin)/analytics/page.tsx"
git commit -m "feat(analíticas): pestañas Cobranza y Recurrente"
```

---

### Task 11: Pestañas Ventas, Proyectos y clientes e Infraestructura

**Files:**
- Create: `src/components/analytics/sales-section.tsx`, `src/components/analytics/portfolio-section.tsx`, `src/components/analytics/infra-section.tsx`
- Modify: `src/app/(admin)/analytics/page.tsx`

**Interfaces:**
- Consumes: `buildSales`, `buildPortfolio`, `buildInfra`; componentes de la Task 9; `STAGE_LABEL`, `ASSET_LABEL` de `@/lib/labels`; `formatDate`; `formatDays`, `formatPct`, `formatARS`.
- Produces: `SalesSection({ d })`, `PortfolioSection({ d })`, `InfraAnalyticsSection({ d })`; el `switch` atiende `ventas`, `proyectos` e `infra` (ya no queda caso `default`).

- [ ] **Step 1: Implementar Ventas**

`src/components/analytics/sales-section.tsx`:

```tsx
import type { buildSales } from "@/domain/analytics/build";
import { formatARS } from "@/domain/money";
import { PROPOSAL_LABEL } from "@/lib/labels";
import { formatDays, formatPct } from "@/lib/format";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildSales>;

export function SalesSection({ d }: { d: Data }) {
  const { cur, prev } = d;
  const statuses = (["BORRADOR", "ENVIADA", "ACEPTADA", "RECHAZADA"] as const).filter((s) => cur.byStatus[s] > 0);
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Propuestas creadas" value={String(cur.created)} hint={`Período anterior: ${prev.created}`} />
        <Kpi
          label="Conversión"
          value={formatPct(cur.conversionPct)}
          hint={`Aceptadas ÷ creadas del período · sobre decididas: ${formatPct(cur.decidedConversionPct)}`}
        />
        <Kpi label="Valor propuesto" value={formatARS(cur.proposedValueCents)} hint="Suma del precio de Pago Único de las creadas" />
        <Kpi
          label="Cierres del período"
          value={String(cur.closedCount)}
          hint={`Propuestas aceptadas en el período · antes: ${prev.closedCount}`}
        />
        {cur.mix.oneTime > 0 && <Kpi label="Valor aceptado (Pago Único)" value={formatARS(cur.acceptedOneTimeValueCents)} />}
        {cur.mix.subscription > 0 && (
          <Kpi label="Abono mensual aceptado" value={formatARS(cur.acceptedMonthlyFeeCents)} hint="Suma del abono de las suscripciones aceptadas" />
        )}
        {cur.avgTicketCents !== null && <Kpi label="Ticket promedio (Pago Único)" value={formatARS(cur.avgTicketCents)} />}
        {cur.avgDaysToClose !== null && (
          <Kpi label="Días hasta el cierre" value={formatDays(cur.avgDaysToClose)} hint="Desde que se crea la propuesta hasta que se acepta" />
        )}
      </KpiGrid>

      {statuses.length > 0 && (
        <Block title="Propuestas creadas en el período, por estado actual">
          <SimpleTable
            headers={[{ label: "Estado" }, { label: "Propuestas", right: true }]}
            rows={statuses.map((s) => [PROPOSAL_LABEL[s], String(cur.byStatus[s])])}
          />
        </Block>
      )}

      {cur.closedCount > 0 && (
        <Block title="Modelos elegidos en los cierres">
          <SimpleTable
            headers={[{ label: "Modelo" }, { label: "Cierres", right: true }]}
            rows={[
              ["Pago Único", String(cur.mix.oneTime)],
              ["Suscripción", String(cur.mix.subscription)],
            ]}
          />
        </Block>
      )}

      <Block title="Pipeline abierto" note="Hoy. Propuestas en borrador o enviadas que todavía no se decidieron.">
        <KpiGrid>
          <Kpi label="Propuestas abiertas" value={String(cur.pipeline.count)} />
          <Kpi label="Valor potencial" value={formatARS(cur.pipeline.valueCents)} hint="Precio de Pago Único" />
          {cur.pipeline.expiredCount > 0 && (
            <Kpi label="Con validez vencida" value={String(cur.pipeline.expiredCount)} hint="Pasó la fecha 'válida hasta'" tone="alert" />
          )}
        </KpiGrid>
      </Block>
    </div>
  );
}
```

- [ ] **Step 2: Implementar Proyectos y clientes**

`src/components/analytics/portfolio-section.tsx`:

```tsx
import type { buildPortfolio } from "@/domain/analytics/build";
import { formatARS } from "@/domain/money";
import { STAGE_LABEL } from "@/lib/labels";
import { formatDays } from "@/lib/format";
import { Block } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildPortfolio>;

export function PortfolioSection({ d }: { d: Data }) {
  const { projects: p, previousProjects: pp, clients: c } = d;
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Proyectos nuevos" value={String(p.created)} hint={`Período anterior: ${pp.created}`} />
        <Kpi label="Proyectos entregados" value={String(p.delivered)} hint={`Período anterior: ${pp.delivered}`} />
        {p.avgDevDays !== null && <Kpi label="Duración del desarrollo" value={formatDays(p.avgDevDays)} hint="Promedio de los entregados en el período" />}
        <Kpi label="Clientes" value={String(c.total)} hint="Hoy" />
        <Kpi label="Clientes nuevos" value={String(c.newInPeriod)} hint="Dados de alta en el período" />
        <Kpi label="Clientes con trabajo en curso" value={String(c.withActiveWork)} hint="Hoy · en desarrollo, mantenimiento o suscripción activa" />
      </KpiGrid>

      <Block title="Proyectos por etapa" note="Hoy. El contratado suma los Pagos Únicos; el abono mensual, las suscripciones.">
        <SimpleTable
          headers={[
            { label: "Etapa" },
            { label: "Proyectos", right: true },
            { label: "Contratado (únicos)", right: true },
            { label: "Abono mensual", right: true },
          ]}
          rows={p.byStage.map((s) => [
            STAGE_LABEL[s.stage],
            String(s.count),
            s.contractedCents > 0 ? formatARS(s.contractedCents) : "—",
            s.monthlyCents > 0 ? formatARS(s.monthlyCents) : "—",
          ])}
        />
      </Block>

      <Block title="Clientes que más aportaron" note="Cobrado acumulado histórico (top 10).">
        <SimpleTable
          headers={[{ label: "Cliente" }, { label: "Cobrado acumulado", right: true }]}
          rows={c.top.map((t) => [t.name, formatARS(t.cents)])}
          empty="Todavía no hay cobros registrados."
        />
      </Block>
    </div>
  );
}
```

- [ ] **Step 3: Implementar Infraestructura**

`src/components/analytics/infra-section.tsx`:

```tsx
import type { buildInfra } from "@/domain/analytics/build";
import type { RenewalGroup } from "@/domain/analytics/infra";
import { formatDate } from "@/domain/dates";
import { formatARS } from "@/domain/money";
import { ASSET_LABEL } from "@/lib/labels";
import { Block, EmptyNote } from "./block";
import { Kpi, KpiGrid } from "./kpi";
import { SimpleTable } from "./simple-table";

type Data = ReturnType<typeof buildInfra>;

function RenewalTable({ title, group, tone }: { title: string; group: RenewalGroup; tone?: "alert" }) {
  if (group.items.length === 0) return null;
  return (
    <Block title={`${title} (${group.items.length})`} note={group.costCents > 0 ? `Costo que paga Naro: ${formatARS(group.costCents)}` : undefined}>
      <SimpleTable
        headers={[
          { label: "Activo" },
          { label: "Proyecto" },
          { label: "Lo gestiona" },
          { label: "Renueva", right: true },
          { label: "Costo", right: true },
        ]}
        rows={group.items.map((r) => [
          `${ASSET_LABEL[r.type]} · ${r.identifier}`,
          r.projectName,
          r.managedByNaro ? "Grupo Naro" : "Cliente",
          <span key="d" className={tone === "alert" ? "font-medium text-red-700" : ""}>
            {formatDate(r.renewalDate)}
          </span>,
          r.costCents ? formatARS(r.costCents) : "—",
        ])}
      />
    </Block>
  );
}

export function InfraAnalyticsSection({ d }: { d: Data }) {
  if (d.total === 0) return <EmptyNote>Todavía no hay dominios, hosting ni servidores cargados.</EmptyNote>;
  const { renewals } = d;
  return (
    <div className="space-y-8">
      <KpiGrid>
        <Kpi label="Costo mensual equivalente" value={formatARS(d.monthlyEquivalentCents)} hint="Hoy · activos que gestiona Naro con costo cargado" />
        <Kpi label="Activos cargados" value={String(d.total)} />
        {renewals.expired.items.length > 0 && (
          <Kpi label="Renovaciones vencidas" value={String(renewals.expired.items.length)} tone="alert" />
        )}
      </KpiGrid>

      <Block title="Activos por tipo">
        <SimpleTable
          headers={[{ label: "Tipo" }, { label: "Gestiona Naro", right: true }, { label: "Gestiona el cliente", right: true }]}
          rows={d.byType.map((t) => [ASSET_LABEL[t.type], String(t.naro), String(t.client)])}
        />
      </Block>

      <RenewalTable title="Renovaciones vencidas" group={renewals.expired} tone="alert" />
      <RenewalTable title="Vencen en los próximos 30 días" group={renewals.next30} />
      <RenewalTable title="Vencen entre 31 y 60 días" group={renewals.next60} />
      <RenewalTable title="Vencen entre 61 y 90 días" group={renewals.next90} />
    </div>
  );
}
```

- [ ] **Step 4: Completar la página**

En `src/app/(admin)/analytics/page.tsx`: importar `buildSales`, `buildPortfolio`, `buildInfra`, `SalesSection`, `PortfolioSection` e `InfraAnalyticsSection`; extender `renderSection` con los tres casos restantes y eliminar el `default` (el `switch` queda exhaustivo sobre `SectionKey`):

```tsx
    case "ventas":
      return <SalesSection d={buildSales(facts, periodo)} />;
    case "proyectos":
      return <PortfolioSection d={buildPortfolio(facts, periodo)} />;
    case "infra":
      return <InfraAnalyticsSection d={buildInfra(facts)} />;
```

Si `EmptyNote` deja de usarse en la página, quitar su import (el linter exige cero advertencias).

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: todo pasa, sin advertencias.

Verificación funcional (base real, producción local, como antes): las seis pestañas × los cuatro períodos (24 combinaciones) responden 200 sin `NaN`/`Infinity`/`undefined`. Con datos de prueba (`DEMOUI6`: propuestas aceptada/rechazada/enviada con validez vencida/borrador; proyectos en distintas etapas con uno entregado este mes; activos de los tres tipos, uno gestionado por el cliente y otro vencido, con costos y periodicidades distintas) comprobar que aparecen las tarjetas condicionales (Abono mensual aceptado solo si hay suscripciones aceptadas; "Con validez vencida" solo si corresponde; "Renovaciones vencidas" solo si hay) y que no aparecen cuando no corresponden. Borrar los datos de prueba y detener el servidor que hayas levantado.

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/sales-section.tsx src/components/analytics/portfolio-section.tsx src/components/analytics/infra-section.tsx "src/app/(admin)/analytics/page.tsx"
git commit -m "feat(analíticas): pestañas Ventas, Proyectos y clientes e Infraestructura"
```

---

### Task 12: Verificación integral contra la base real

**Files:**
- Ninguno en el repositorio (el script de verificación va en el directorio de trabajo temporal de la sesión, fuera del repo).

**Interfaces:**
- Consumes: la aplicación completa de las Tasks 1–11.
- Produces: evidencia de que las cifras de la pantalla coinciden con un cálculo independiente directo sobre la base.

- [ ] **Step 1: Preparar el script de verificación (fuera del repo)**

Un script Node (`verify-analytics.mjs`, en el directorio temporal de la sesión) que:
1. Carga `.env` sin imprimirlo, arma el cliente de Prisma desde `C:/Users/Lautaro/Desktop/administrador` (vía `createRequire`) y usa `playwright-core` con Edge (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; instalar `playwright-core@1.49.1` en el directorio temporal si hace falta).
2. Crea datos de prueba con el tag `DEMOUI6` (cliente "DEMOUI6 …", proyectos, planes, cuotas, pagos, propuestas, activos) que cubran: un proyecto único con anticipo pagado este mes y una cuota con pago parcial que vence este mes; una cuota vencida sin pagar hace 20 días y otra hace 70; una cuota pagada tarde este mes (último pago posterior al vencimiento); una suscripción activa con pagos en los últimos 3 meses y otra con una cuota vencida; un mantenimiento activo y otro dado de baja este mes; propuestas en los cuatro estados (una aceptada con proyecto creado este mes, otra de un mes anterior cerrada este mes); activos de los tres tipos con costos y periodicidades 1/3/12, uno del cliente y uno vencido.
3. Levanta `pnpm start` en un puerto libre (nunca el 3000 del usuario), inicia sesión con `ADMIN_EMAIL`/`ADMIN_PASSWORD` y recorre las 24 combinaciones pestaña × período.

- [ ] **Step 2: Chequeos de integridad de la pantalla**

Para las 24 combinaciones: respuesta 200; el texto de `main` no contiene `NaN`, `Infinity`, `undefined` ni `[object`; no hay desbordamiento horizontal de la página en 390 px de ancho.

- [ ] **Step 3: Chequeos de cifras contra un cálculo independiente**

Calcular desde la base con consultas directas de Prisma (sin importar nada de `src/domain/analytics`) y comparar contra lo que muestra la pantalla, en `periodo=mes` y `periodo=semana`:
1. **Cobrado** = suma de `Payment.amount` con `paidAt` en el rango.
2. **Proyectado** = suma de `Installment.amount` con `dueDate` en el rango.
3. **Vencido** y **Por cobrar** = saldo de las cuotas del rango con `dueDate` menor / mayor o igual a hoy.
4. **Costos de infraestructura** = suma, por activo de Naro con costo, de `costo / (costEveryMonths × 30,4375) × días del rango` (redondeado por activo); **Balance neto** = Cobrado − Costos.
5. **MRR** = abonos de suscripciones activas (sin cuota vencida ni suspendidas) + mantenimientos sin baja.
6. **Deuda total** = saldo de todas las cuotas; **antigüedad** de lo vencido en los tramos 1–7, 8–30, 31–60 y más de 60 días.
7. **Propuestas creadas / aceptadas** del mes y **conversión**.
8. **Costo mensual equivalente** de infraestructura = suma de `costo / costEveryMonths` por activo de Naro con costo.

Mostrar para cada chequeo el valor de la pantalla, el valor independiente y OK/FALLA. Cualquier FALLA es un defecto a corregir (en el código, no en el script) antes de seguir.

- [ ] **Step 4: Chequeos de partes opcionales y de acceso**

1. Con datos de prueba sin suscripciones ni mantenimientos activos (borrar esos contratos de prueba temporalmente y recargar): la pestaña Recurrente muestra el aviso vacío y el MRR no aparece; al volver a crearlos, reaparecen.
2. Las tarjetas "Suscripciones vencidas" / "suspendidas" / "Con validez vencida" / "Renovaciones vencidas" aparecen solo cuando hay casos.
3. `/analytics` sin sesión redirige a `/login` (307) y `/client/view/<token inventado de 43 caracteres>` sigue dando 404.
4. Un balance negativo (cargar un activo con un costo mayor que lo cobrado) se muestra con signo y en rojo, sin romper el formato.

- [ ] **Step 5: Limpieza y estado final**

Borrar todas las filas `DEMOUI6` (proyectos, propuestas, activos y el cliente), comprobar que quedan 0, detener el servidor que hayas levantado y eliminar los archivos temporales. Correr una última vez `pnpm typecheck && pnpm lint && pnpm test && pnpm build` y confirmar que pasan sin advertencias. No hay nada que commitear en esta tarea.

---

## Self-review (cobertura de la spec)

| Spec | Tarea |
|---|---|
| §2 Estructura (ruta, parámetros, selector, pestañas, partes opcionales) | 9, 10, 11 |
| §3 Períodos y comparación | 2 |
| §4.1 Finanzas | 3, 9 |
| §4.2 Cobranza | 4, 10 |
| §4.3 Recurrente | 5, 10 |
| §4.4 Ventas | 6, 11 |
| §4.5 Proyectos y clientes | 7, 11 |
| §4.6 Infraestructura | 7, 11 |
| §5 Modelo de datos (`costEveryMonths`) | 1 |
| §6 Arquitectura (dominio puro, queries, componentes, SVG propio, `connection`/`instant`) | 2–11 |
| §7 Pruebas (unitarias con fechas fijas + verificación contra la base) | 2–8 (unitarias), 9–12 (funcional) |
| §8 Limitaciones (período en curso vs. anterior completo, costos aproximados, etc.) | 9 (aviso en pantalla), 10 y 11 (notas) |

Consistencia de nombres revisada entre tareas: `PeriodKey`/`Period`/`Bucket`/`resolvePeriod`/`bucketsOf`/`periodRangeLabel`/`variation` (Task 2) → usados igual en 3, 8, 9, 10, 11; `FinancePayment`/`financeSummary`/`financeSeries`/`topCollected`/`topShare` (Task 3) → Task 8 y 9; `CollectionInstallment`/`agingBuckets`/`punctuality`/`debtSummary`/`debtorsByClient` (Task 4) → Task 8 y 10; `RecurringContract`/`recurringSummary`/`recurringCollectedSeries` (Task 5) → Task 8 y 10; `SalesProposal`/`salesSummary` (Task 6) → Task 8 y 11; `PortfolioProject`/`PortfolioClient`/`projectsSummary`/`clientsSummary` y `InfraAsset`/`infraSummary` (Task 7) → Task 8 y 11; `Facts`/`buildFinance`/`buildCollections`/`buildRecurring`/`buildSales`/`buildPortfolio`/`buildInfra`/`loadFacts` (Task 8) → Tasks 9–11.

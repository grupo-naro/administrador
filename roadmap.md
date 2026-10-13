# Grupo Naro — Plan de implementación (roadmap)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el panel interno de Grupo Naro (clientes, propuestas, proyectos, cuotas/pagos, infraestructura, dashboard) y el portal público de solo lectura por token, listo para correr en un VPS casero detrás de Cloudflare Tunnel.

**Architecture:** Monolito Next.js 16 (App Router). Las reglas de negocio (cuotas, saldos, estados, métricas, DTO del portal) viven en `src/domain/` como funciones puras en **centavos enteros**, sin Prisma ni Next, probadas con Vitest. `src/server/` contiene consultas Prisma y Server Actions que mapean entre Prisma y el dominio. Las páginas son Server Components; los formularios usan un único `ActionForm` cliente con `useActionState`.

**Tech Stack:** Next.js 16.4 · React 19.3 · TypeScript · Tailwind 4 · shadcn/ui · PostgreSQL local · Prisma 6 · Auth.js (`next-auth@beta`, Credentials, JWT) · Zod · bcryptjs · Vitest · pm2 · cloudflared.

**Spec:** [specs/2026-10-13-grupo-naro-design.md](specs/2026-10-13-grupo-naro-design.md)

## Global Constraints

- **Antes de escribir código de Next, leer `node_modules/next/dist/docs/`** (AGENTS.md: esta versión rompe con lo que se conoce). Hallazgos ya verificados:
  - `middleware.ts` se llama **`proxy.ts`** (export `proxy` o default) y vive en `src/`.
  - El scaffold trae `cacheComponents: true`: leer `cookies()`/base de datos fuera de `<Suspense>` es error de build. Los segmentos dinámicos de este proyecto declaran `export const instant = false` (opt-out documentado en `01-app/02-guides/instant-navigation.md`). Si `pnpm build` reporta `blocking-prerender-dynamic`, seguir el mensaje: envolver el componente en `<Suspense>` o confirmar el `instant = false`.
  - `params` y `searchParams` son `Promise`: `const { id } = await params`.
  - Todo Server Action debe verificar sesión adentro (se puede invocar por POST directo).
- PostgreSQL en la **misma máquina** que la app; acceso por `localhost`, puerto no expuesto.
- Dinero: `Decimal(14,2)` en base, **centavos enteros** en el dominio; moneda ARS implícita.
- Pago Único: anticipo = 50% del total; el resto en **2 o 3** cuotas; el sobrante de redondeo va a la última cuota.
- Suscripción: **sin cálculo automático del recargo**; se cargan a mano `monthlyFee` y `firstPaymentAmount`. Se generan **6** cuotas (primer pago + 5 mensuales).
- Mantenimiento (Pago Único): opcional, plan separado (`MANTENIMIENTO`), mismas 6 cuotas y ajuste por inflación.
- `VENCIDO` y `serviceStatus` `VENCIDA` se **derivan al leer**; no hay cron. Solo `PENDIENTE`/`PAGADO` se guardan.
- Todos los cobros se registran **a mano**. **Sin integración con Mercado Pago.**
- Portal `/client/view/[token]`: solo lectura, sin login, `noindex`, DTO explícito, 404 genérico ante token inválido; el token se guarda como hash SHA-256 y se muestra una sola vez.
- Auth: Auth.js con credenciales, solo administradores creados por seed, sin registro público.
- Zona horaria de negocio: `America/Argentina/Buenos_Aires` para "hoy"; las fechas de cuotas son `@db.Date` manejadas como UTC medianoche.
- Idioma de UI y mensajes: español.

## Review Focus

Entradas que la spec implica y ninguna prueba obvia cubre; cada una tiene su test en la tarea indicada:

1. **Pago mayor al saldo de la cuota** (o a una cuota ya pagada) → se rechaza con mensaje claro (Task 5, `assertPayable`; usado en Task 11).
2. **Primer cobro el 29, 30 o 31** → las fechas siguientes no derivan (ene-31 → feb-28 → mar-31) (Task 3 y Task 4).
3. **Totales con centavos que no dividen exacto** (ej. $1.000,00 en 3 cuotas) → la suma de cuotas es exactamente el total (Task 4).
4. **Token revocado, vencido, malformado o inexistente** → todos responden igual (404) y no tocan la base si está malformado (Task 15).
5. **Ajuste por inflación sobre cuotas con pagos parciales o de otro tipo** (anticipo, primer pago) → no se modifican (Task 4).

---

## Estructura de archivos

```
prisma/schema.prisma, prisma/seed.ts
src/
  proxy.ts                         # protege el panel (optimistic check)
  auth.ts, auth.config.ts          # Auth.js
  domain/                          # PURO, con tests (*.test.ts al lado)
    money.ts dates.ts installments.ts status.ts metrics.ts portal.ts labels.ts
  lib/
    prisma.ts auth-guard.ts form.ts tokens.ts rate-limit.ts labels.ts
  server/
    mappers.ts
    clients/{queries,actions}.ts
    proposals/{queries,actions}.ts
    projects/{create,queries,actions}.ts
    billing/{recalc,queries,actions}.ts
    infrastructure/{queries,actions}.ts
    dashboard/queries.ts
    portal/{queries,actions}.ts
  components/
    action-form.tsx fields.tsx admin-nav.tsx
    project/{billing-section,infra-section,portal-section}.tsx
  app/
    page.tsx                       # redirect a /dashboard
    login/page.tsx
    api/auth/[...nextauth]/route.ts
    (admin)/layout.tsx, dashboard, clients, proposals, projects, infrastructure
    client/view/[token]/page.tsx   # público
deploy/                            # ecosystem, cloudflared, backup
```

---

### Task 1: Dependencias, herramientas y base de datos

**Files:**
- Modify: `package.json`, `pnpm-workspace.yaml`, `next.config.ts`, `.gitignore`
- Create: `vitest.config.ts`, `.env.example`, `.env` (no se commitea)

**Interfaces:**
- Produces: scripts `pnpm test`, `pnpm typecheck`; variables `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `APP_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; alias `@/` → `src/` también en Vitest.

- [ ] **Step 1: Instalar dependencias**

```bash
pnpm add @prisma/client@^6 next-auth@beta bcryptjs zod server-only
pnpm add -D prisma@^6 vitest tsx
```

En `pnpm-workspace.yaml` permitir los scripts de build de Prisma (pnpm 10 los bloquea):

```yaml
onlyBuiltDependencies:
  - prisma
  - "@prisma/client"
  - "@prisma/engines"
  - esbuild
ignoredBuiltDependencies:
  - sharp
  - unrs-resolver
```

Run: `pnpm install` — Expected: termina sin pedir aprobación de scripts.

- [ ] **Step 2: Inicializar shadcn/ui**

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input label textarea card table badge
```

Verificar que `components.json` y `src/components/ui/*.tsx` existen y que `src/app/globals.css` conserva el import de Tailwind. Si el CLI pregunta algo, elegir los valores por defecto (alias `@/components`, `@/lib/utils`).

- [ ] **Step 3: Configurar Vitest y scripts**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

En `package.json` agregar a `scripts`:

```json
"test": "vitest run",
"typecheck": "tsc --noEmit",
"db:migrate": "prisma migrate dev",
"db:seed": "prisma db seed"
```

y a nivel raíz:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

- [ ] **Step 4: Variables de entorno y .gitignore**

`.env.example`:

```bash
DATABASE_URL="postgresql://postgres:CAMBIAR@localhost:5432/grupo_naro?schema=public"
AUTH_SECRET="generar con: npx auth secret   (o openssl rand -base64 32)"
AUTH_TRUST_HOST="true"
APP_URL="http://localhost:3000"
ADMIN_EMAIL="admin@gruponaro.com"
ADMIN_PASSWORD="cambiar-esta-clave"
```

Copiar a `.env` y completar valores reales. En `.gitignore` asegurar estas dos líneas (en este orden):

```
.env*
!.env.example
```

- [ ] **Step 5: Habilitar build standalone**

En `next.config.ts` agregar `output: "standalone",` dentro de `nextConfig` (conservar `cacheComponents`, `partialPrefetching` y `turbopack`).

- [ ] **Step 6: Crear la base de datos**

`psql` no está en el PATH de esta máquina. Usar la ruta de la instalación (ej. `"C:\Program Files\PostgreSQL\16\bin\psql.exe"`) o pgAdmin:

```bash
psql -U postgres -h localhost -c "CREATE DATABASE grupo_naro;"
```

Expected: `CREATE DATABASE`.

- [ ] **Step 7: Verificar y commitear**

Run: `pnpm typecheck && pnpm lint` — Expected: sin errores.

```bash
git add -A
git commit -m "chore: dependencias, vitest, shadcn y entorno base"
```

---

### Task 2: Esquema Prisma, migración y seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/prisma.ts`, `src/server/mappers.ts`

**Interfaces:**
- Produces: modelos `AdminUser, Client, Proposal, Project, InstallmentPlan, Installment, Payment, InfrastructureAsset, ClientAccessToken`; `prisma` (singleton); `decToCents(d: Prisma.Decimal): number`; `centsToDec(c: number): string`.
- Nota: la spec lista `serviceStatus` en `Project`; aquí se guarda solo `serviceSuspended: boolean` y `serviceStatus` se deriva (spec §4).

- [ ] **Step 1: Escribir `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum ProposalStatus { BORRADOR ENVIADA ACEPTADA RECHAZADA }
enum ContractType { PAGO_UNICO SUSCRIPCION }
enum ProjectStage { COTIZACION EN_DESARROLLO ENTREGADO EN_MANTENIMIENTO }
enum CodeOwner { CLIENTE NARO }
enum PlanKind { DESARROLLO SUSCRIPCION MANTENIMIENTO }
enum InstallmentType { ANTICIPO CUOTA PRIMER_PAGO MENSUAL MANTENIMIENTO }
enum InstallmentStatus { PENDIENTE PAGADO }
enum AssetType { DOMINIO HOSTING SERVIDOR }

model AdminUser {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  createdAt    DateTime @default(now())
}

model Client {
  id          String     @id @default(cuid())
  name        String
  contactName String?
  email       String?
  phone       String?
  taxId       String?
  notes       String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  projects    Project[]
  proposals   Proposal[]
}

model Proposal {
  id            String         @id @default(cuid())
  clientId      String
  client        Client         @relation(fields: [clientId], references: [id])
  title         String
  scope         String?
  oneTimePrice  Decimal        @db.Decimal(14, 2)
  monthlyFee    Decimal        @db.Decimal(14, 2)
  status        ProposalStatus @default(BORRADOR)
  acceptedModel ContractType?
  validUntil    DateTime?      @db.Date
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  project       Project?

  @@index([clientId])
}

model Project {
  id                  String               @id @default(cuid())
  clientId            String
  client              Client               @relation(fields: [clientId], references: [id])
  proposalId          String?              @unique
  proposal            Proposal?            @relation(fields: [proposalId], references: [id])
  name                String
  stage               ProjectStage         @default(COTIZACION)
  contractType        ContractType
  totalAmount         Decimal?             @db.Decimal(14, 2)
  monthlyFee          Decimal?             @db.Decimal(14, 2)
  firstPaymentAmount  Decimal?             @db.Decimal(14, 2)
  serviceSuspended    Boolean              @default(false)
  codeOwner           CodeOwner
  maintenanceFee      Decimal?             @db.Decimal(14, 2)
  maintenanceStartsAt DateTime?            @db.Date
  maintenanceEndedAt  DateTime?            @db.Date
  startedAt           DateTime?            @db.Date
  deliveredAt         DateTime?            @db.Date
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  plans               InstallmentPlan[]
  assets              InfrastructureAsset[]
  tokens              ClientAccessToken[]

  @@index([clientId])
}

model InstallmentPlan {
  id               String        @id @default(cuid())
  projectId        String
  project          Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  kind             PlanKind
  totalAmount      Decimal?      @db.Decimal(14, 2)
  installmentCount Int?
  createdAt        DateTime      @default(now())
  installments     Installment[]

  @@unique([projectId, kind])
}

model Installment {
  id       String            @id @default(cuid())
  planId   String
  plan     InstallmentPlan   @relation(fields: [planId], references: [id], onDelete: Cascade)
  type     InstallmentType
  sequence Int
  amount   Decimal           @db.Decimal(14, 2)
  dueDate  DateTime          @db.Date
  status   InstallmentStatus @default(PENDIENTE)
  payments Payment[]

  @@unique([planId, sequence])
  @@index([dueDate, status])
}

model Payment {
  id            String      @id @default(cuid())
  installmentId String
  installment   Installment @relation(fields: [installmentId], references: [id], onDelete: Cascade)
  amount        Decimal     @db.Decimal(14, 2)
  paidAt        DateTime    @db.Date
  method        String
  receiptNote   String?
  receiptUrl    String?
  createdAt     DateTime    @default(now())

  @@index([paidAt])
}

model InfrastructureAsset {
  id            String    @id @default(cuid())
  projectId     String
  project       Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  type          AssetType
  provider      String
  identifier    String
  renewalDate   DateTime  @db.Date
  managedByNaro Boolean   @default(true)
  costAmount    Decimal?  @db.Decimal(14, 2)

  @@index([renewalDate])
}

model ClientAccessToken {
  id           String    @id @default(cuid())
  projectId    String
  project      Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tokenHash    String    @unique
  createdAt    DateTime  @default(now())
  expiresAt    DateTime?
  revokedAt    DateTime?
  lastViewedAt DateTime?
}
```

- [ ] **Step 2: Migrar**

Run: `pnpm db:migrate --name init` — Expected: crea `prisma/migrations/*_init` y genera el cliente.

- [ ] **Step 3: Singleton de Prisma y mappers**

`src/lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = g.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```

`src/server/mappers.ts` (depende de `toCents`, creado en Task 3; crear este archivo en el Step 3 de Task 3 si se ejecuta fuera de orden):

```ts
import "server-only";
import type { Prisma } from "@prisma/client";
import { toCents } from "@/domain/money";

export const decToCents = (d: Prisma.Decimal): number => toCents(d.toString());
export const centsToDec = (cents: number): string => (cents / 100).toFixed(2);
```

> Ejecutar este paso **después de Task 3**. Si se hace antes, dejar el archivo para el final de Task 3.

- [ ] **Step 4: Seed del administrador**

`prisma/seed.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Definir ADMIN_EMAIL y ADMIN_PASSWORD en .env");
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, passwordHash, name: "Administrador" },
  });
  console.log(`Admin listo: ${email}`);
}

main().finally(() => prisma.$disconnect());
```

Run: `pnpm db:seed` — Expected: `Admin listo: admin@gruponaro.com`. (Prisma carga `.env` por sí mismo; `tsx` hereda las variables del proceso de `prisma db seed`.)

- [ ] **Step 5: Verificar y commitear**

Run: `pnpm exec prisma validate && pnpm typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: esquema Prisma, migración inicial y seed de admin"
```

---

### Task 3: Dominio — dinero y fechas (TDD)

**Files:**
- Create: `src/domain/money.ts`, `src/domain/dates.ts`
- Test: `src/domain/money.test.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Produces:
  - `toCents(value: number | string): number` (acepta coma decimal, sin separador de miles; lanza `"Monto inválido"`), `fromCents(c: number): number`, `formatARS(c: number): string`
  - `parseDateInput(s: "YYYY-MM-DD"): Date` (UTC, lanza `"Fecha inválida"`), `toDateInput(d: Date): string`, `addMonths(d: Date, n: number): Date` (recorta fin de mes), `todayAR(now?: Date): Date`, `diffDays(a: Date, b: Date): number`, `formatDate(d: Date): string` (dd/mm/aaaa)

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatARS } from "./money";

describe("money", () => {
  it("convierte a centavos sin error de punto flotante", () => {
    expect(toCents("10.05")).toBe(1005);
    expect(toCents("400000")).toBe(40_000_000);
    expect(toCents("400000,50")).toBe(40_000_050);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("rechaza texto inválido", () => {
    expect(() => toCents("abc")).toThrow("Monto inválido");
    expect(() => toCents("1.234,56")).toThrow("Monto inválido");
  });

  it("fromCents invierte toCents", () => {
    expect(fromCents(40_000_050)).toBe(400000.5);
  });

  it("formatARS muestra pesos argentinos", () => {
    const s = formatARS(40_000_000).replace(/\s/g, " ");
    expect(s).toContain("$");
    expect(s).toContain("400.000,00");
  });
});
```

`src/domain/dates.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { addMonths, diffDays, formatDate, parseDateInput, toDateInput, todayAR } from "./dates";

const d = parseDateInput;

describe("dates", () => {
  it("parsea y rechaza fechas", () => {
    expect(toDateInput(d("2026-11-15"))).toBe("2026-11-15");
    expect(() => d("2026-02-30")).toThrow("Fecha inválida");
    expect(() => d("15/11/2026")).toThrow("Fecha inválida");
  });

  it("addMonths recorta fin de mes y no deriva", () => {
    expect(toDateInput(addMonths(d("2027-01-31"), 1))).toBe("2027-02-28");
    expect(toDateInput(addMonths(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(toDateInput(addMonths(d("2027-01-31"), 2))).toBe("2027-03-31");
    expect(toDateInput(addMonths(d("2026-12-15"), 1))).toBe("2027-01-15");
  });

  it("todayAR usa la zona horaria de Argentina", () => {
    // 02:30 UTC del 13 = 23:30 del 12 en Buenos Aires
    expect(toDateInput(todayAR(new Date("2026-10-13T02:30:00Z")))).toBe("2026-10-12");
    expect(toDateInput(todayAR(new Date("2026-10-13T12:00:00Z")))).toBe("2026-10-13");
  });

  it("diffDays y formatDate", () => {
    expect(diffDays(d("2026-10-20"), d("2026-10-13"))).toBe(7);
    expect(formatDate(d("2026-10-13"))).toBe("13/10/2026");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test` — Expected: FAIL (`Cannot find module './money'`).

- [ ] **Step 3: Implementar**

`src/domain/money.ts`:

```ts
export function toCents(value: number | string): number {
  const n = typeof value === "string" ? Number(value.trim().replace(",", ".")) : value;
  if (!Number.isFinite(n)) throw new Error("Monto inválido");
  return Math.round(n * 100);
}

export const fromCents = (cents: number): number => cents / 100;

export function formatARS(cents: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(cents / 100);
}
```

`src/domain/dates.ts`:

```ts
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateInput(value: string): Date {
  const m = DATE_RE.exec(value.trim());
  if (!m) throw new Error("Fecha inválida");
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== day) {
    throw new Error("Fecha inválida");
  }
  return date;
}

export const toDateInput = (d: Date): string => d.toISOString().slice(0, 10);

export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), lastDay)));
}

export function todayAR(now: Date = new Date()): Date {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(now);
  return parseDateInput(s);
}

export const diffDays = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86_400_000);

export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test` — Expected: PASS (money y dates).

- [ ] **Step 5: Crear mappers pendientes de Task 2 y commitear**

Si `src/server/mappers.ts` no existe, crearlo ahora con el contenido del Task 2 Step 3.

```bash
git add -A
git commit -m "feat(domain): utilidades de dinero y fechas"
```

---

### Task 4: Dominio — generación de cuotas y ajuste (TDD)

**Files:**
- Create: `src/domain/installments.ts`
- Test: `src/domain/installments.test.ts`

**Interfaces:**
- Consumes: `addMonths` (Task 3).
- Produces:

```ts
type InstallmentType = "ANTICIPO" | "CUOTA" | "PRIMER_PAGO" | "MENSUAL" | "MANTENIMIENTO";
interface InstallmentDraft { type: InstallmentType; sequence: number; amountCents: number; dueDate: Date }
const BATCH_SIZE = 6;
planOneTime(a: { totalCents: number; count: number; startDate: Date }): InstallmentDraft[]
planRecurring(a: { type: "MENSUAL" | "MANTENIMIENTO"; feeCents: number; baseDate: Date; startSequence: number; count: number }): InstallmentDraft[]
planSubscription(a: { monthlyFeeCents: number; firstPaymentCents: number; firstDueDate: Date; count?: number }): InstallmentDraft[]
repriceInstallments(items: RepriceItem[], fromDate: Date, newFeeCents: number): { id: string; amountCents: number }[]
needsExtension(pendingRecurringCount: number): boolean
```

La fecha de vencimiento de la cuota con secuencia `n` es siempre `addMonths(baseDate, n - 1)`: así extender un plan no acumula deriva de fin de mes.

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/installments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDateInput as d, toDateInput } from "./dates";
import {
  BATCH_SIZE,
  needsExtension,
  planOneTime,
  planRecurring,
  planSubscription,
  repriceInstallments,
} from "./installments";

const dates = (xs: { dueDate: Date }[]) => xs.map((x) => toDateInput(x.dueDate));
const sum = (xs: { amountCents: number }[]) => xs.reduce((s, x) => s + x.amountCents, 0);

describe("planOneTime", () => {
  it("anticipo 50% y 3 cuotas con sobrante en la última", () => {
    const plan = planOneTime({ totalCents: 100_000, count: 3, startDate: d("2026-11-10") });
    expect(plan.map((p) => p.type)).toEqual(["ANTICIPO", "CUOTA", "CUOTA", "CUOTA"]);
    expect(plan.map((p) => p.sequence)).toEqual([1, 2, 3, 4]);
    expect(plan.map((p) => p.amountCents)).toEqual([50_000, 16_666, 16_666, 16_668]);
    expect(dates(plan)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(sum(plan)).toBe(100_000);
  });

  it("2 cuotas con total impar suma exacto", () => {
    const plan = planOneTime({ totalCents: 100_001, count: 2, startDate: d("2026-11-10") });
    expect(sum(plan)).toBe(100_001);
    expect(plan[0].amountCents).toBe(50_001);
  });

  it("inicio el día 31 no deriva", () => {
    const plan = planOneTime({ totalCents: 90_000, count: 3, startDate: d("2027-01-31") });
    expect(dates(plan)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("rechaza cantidades y totales inválidos", () => {
    expect(() => planOneTime({ totalCents: 100_000, count: 4, startDate: d("2026-11-10") })).toThrow("2 o 3");
    expect(() => planOneTime({ totalCents: 0, count: 2, startDate: d("2026-11-10") })).toThrow("mayor a cero");
  });
});

describe("planSubscription", () => {
  it("primer pago manual + 5 mensuales", () => {
    const plan = planSubscription({
      monthlyFeeCents: 40_000_000,
      firstPaymentCents: 60_000_000,
      firstDueDate: d("2026-11-15"),
    });
    expect(plan).toHaveLength(BATCH_SIZE);
    expect(plan[0]).toMatchObject({ type: "PRIMER_PAGO", sequence: 1, amountCents: 60_000_000 });
    expect(plan.slice(1).every((p) => p.type === "MENSUAL" && p.amountCents === 40_000_000)).toBe(true);
    expect(dates(plan)).toEqual([
      "2026-11-15", "2026-12-15", "2027-01-15", "2027-02-15", "2027-03-15", "2027-04-15",
    ]);
  });

  it("primer cobro el 31 no deriva", () => {
    const plan = planSubscription({ monthlyFeeCents: 100, firstPaymentCents: 100, firstDueDate: d("2027-01-31") });
    expect(dates(plan).slice(0, 4)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
});

describe("planRecurring", () => {
  it("extiende desde la secuencia indicada anclando en la fecha base", () => {
    const more = planRecurring({
      type: "MENSUAL", feeCents: 500, baseDate: d("2027-01-31"), startSequence: 3, count: 2,
    });
    expect(more.map((m) => m.sequence)).toEqual([3, 4]);
    expect(dates(more)).toEqual(["2027-03-31", "2027-04-30"]);
  });

  it("rechaza abono no positivo", () => {
    expect(() =>
      planRecurring({ type: "MANTENIMIENTO", feeCents: 0, baseDate: d("2026-11-01"), startSequence: 1, count: 6 }),
    ).toThrow("mayor a cero");
  });
});

describe("repriceInstallments", () => {
  const base = (over: object) => ({
    id: "x", type: "MENSUAL" as const, dueDate: d("2027-03-15"), amountCents: 100, paidCents: 0, ...over,
  });

  it("solo toca recurrentes futuras, sin pagos, con monto distinto", () => {
    const res = repriceInstallments(
      [
        base({ id: "ok-mensual" }),
        base({ id: "ok-mant", type: "MANTENIMIENTO" }),
        base({ id: "antes", dueDate: d("2027-01-15") }),
        base({ id: "pago-parcial", paidCents: 10 }),
        base({ id: "primer-pago", type: "PRIMER_PAGO" }),
        base({ id: "anticipo", type: "ANTICIPO" }),
        base({ id: "cuota", type: "CUOTA" }),
        base({ id: "mismo-monto", amountCents: 150 }),
      ],
      d("2027-02-01"),
      150,
    );
    expect(res).toEqual([
      { id: "ok-mensual", amountCents: 150 },
      { id: "ok-mant", amountCents: 150 },
    ]);
  });
});

describe("needsExtension", () => {
  it("pide más cuotas cuando quedan menos de 2 pendientes", () => {
    expect(needsExtension(1)).toBe(true);
    expect(needsExtension(2)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/domain/installments.test.ts` — Expected: FAIL (`Cannot find module './installments'`).

- [ ] **Step 3: Implementar**

`src/domain/installments.ts`:

```ts
import { addMonths } from "./dates";

export type InstallmentType = "ANTICIPO" | "CUOTA" | "PRIMER_PAGO" | "MENSUAL" | "MANTENIMIENTO";

export interface InstallmentDraft {
  type: InstallmentType;
  sequence: number;
  amountCents: number;
  dueDate: Date;
}

export const BATCH_SIZE = 6;

const assertPositive = (cents: number, what: string) => {
  if (!Number.isInteger(cents) || cents <= 0) throw new Error(`${what} debe ser mayor a cero`);
};

export function planOneTime(a: { totalCents: number; count: number; startDate: Date }): InstallmentDraft[] {
  assertPositive(a.totalCents, "El total");
  if (a.count !== 2 && a.count !== 3) throw new Error("Las cuotas deben ser 2 o 3");
  const anticipo = Math.round(a.totalCents / 2);
  const remaining = a.totalCents - anticipo;
  const base = Math.floor(remaining / a.count);
  const drafts: InstallmentDraft[] = [
    { type: "ANTICIPO", sequence: 1, amountCents: anticipo, dueDate: a.startDate },
  ];
  for (let i = 1; i <= a.count; i++) {
    drafts.push({
      type: "CUOTA",
      sequence: i + 1,
      amountCents: i === a.count ? remaining - base * (a.count - 1) : base,
      dueDate: addMonths(a.startDate, i),
    });
  }
  return drafts;
}

export function planRecurring(a: {
  type: "MENSUAL" | "MANTENIMIENTO";
  feeCents: number;
  baseDate: Date;
  startSequence: number;
  count: number;
}): InstallmentDraft[] {
  assertPositive(a.feeCents, "El abono");
  return Array.from({ length: a.count }, (_, i) => {
    const sequence = a.startSequence + i;
    return { type: a.type, sequence, amountCents: a.feeCents, dueDate: addMonths(a.baseDate, sequence - 1) };
  });
}

export function planSubscription(a: {
  monthlyFeeCents: number;
  firstPaymentCents: number;
  firstDueDate: Date;
  count?: number;
}): InstallmentDraft[] {
  assertPositive(a.firstPaymentCents, "El primer pago");
  const count = a.count ?? BATCH_SIZE;
  return [
    { type: "PRIMER_PAGO", sequence: 1, amountCents: a.firstPaymentCents, dueDate: a.firstDueDate },
    ...planRecurring({
      type: "MENSUAL",
      feeCents: a.monthlyFeeCents,
      baseDate: a.firstDueDate,
      startSequence: 2,
      count: count - 1,
    }),
  ];
}

export interface RepriceItem {
  id: string;
  type: InstallmentType;
  dueDate: Date;
  amountCents: number;
  paidCents: number;
}

export function repriceInstallments(
  items: RepriceItem[],
  fromDate: Date,
  newFeeCents: number,
): { id: string; amountCents: number }[] {
  assertPositive(newFeeCents, "El abono");
  return items
    .filter(
      (i) =>
        (i.type === "MENSUAL" || i.type === "MANTENIMIENTO") &&
        i.dueDate.getTime() >= fromDate.getTime() &&
        i.paidCents === 0 &&
        i.amountCents !== newFeeCents,
    )
    .map((i) => ({ id: i.id, amountCents: newFeeCents }));
}

export const needsExtension = (pendingRecurringCount: number): boolean => pendingRecurringCount < 2;
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): generación de cuotas y ajuste por inflación"
```

---

### Task 5: Dominio — estados, saldos, métricas y alertas (TDD)

**Files:**
- Create: `src/domain/status.ts`, `src/domain/metrics.ts`
- Test: `src/domain/status.test.ts`, `src/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `addMonths`, `diffDays` (Task 3).
- Produces:

```ts
type ComputedStatus = "PENDIENTE" | "PAGADO" | "VENCIDO";
type ServiceStatus = "ACTIVO" | "VENCIDA" | "SUSPENDIDO";
installmentStatus(i: {amountCents; paidCents; dueDate: Date}, today: Date): ComputedStatus
remainingCents(i: {amountCents; paidCents}): number
summarize(items: {amountCents; paidCents}[]): { totalCents; paidCents; pendingCents }
serviceStatus(a: { suspended: boolean; installments: {amountCents; paidCents; dueDate: Date}[] }, today: Date): ServiceStatus
assertPayable(remainingCents: number, amountCents: number): void   // lanza Error con mensaje en español
mrrCents(items: { kind: "SUSCRIPCION" | "MANTENIMIENTO"; feeCents: number; active: boolean }[]): { subscriptionCents; maintenanceCents; totalCents }
realVsProjected(a: { payments: {amountCents; paidAt: Date}[]; installments: {amountCents; dueDate: Date}[] }, from: Date, to: Date): { realCents; projectedCents }   // [from, to)
installmentAlerts<T>(items: (T & {amountCents; paidCents; dueDate: Date})[], today: Date, windowDays?: number /*7*/): { overdue: T[]; upcoming: T[] }
renewalAlerts<T>(items: (T & {renewalDate: Date})[], today: Date, windowDays?: number /*30*/): { expired: T[]; upcoming: T[] }
```

- [ ] **Step 1: Escribir los tests que fallan**

`src/domain/status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDateInput as d } from "./dates";
import { assertPayable, installmentStatus, remainingCents, serviceStatus, summarize } from "./status";

const today = d("2026-10-13");
const inst = (amountCents: number, paidCents: number, due: string) => ({ amountCents, paidCents, dueDate: d(due) });

describe("installmentStatus", () => {
  it("PAGADO cuando lo pagado cubre el monto", () => {
    expect(installmentStatus(inst(100, 100, "2026-01-01"), today)).toBe("PAGADO");
  });
  it("VENCIDO solo si la fecha ya pasó (hoy no es vencido)", () => {
    expect(installmentStatus(inst(100, 0, "2026-10-12"), today)).toBe("VENCIDO");
    expect(installmentStatus(inst(100, 0, "2026-10-13"), today)).toBe("PENDIENTE");
    expect(installmentStatus(inst(100, 40, "2026-10-12"), today)).toBe("VENCIDO");
  });
});

describe("summarize y remaining", () => {
  it("suma total, pagado y pendiente", () => {
    expect(summarize([inst(100, 100, "2026-01-01"), inst(300, 50, "2026-12-01")])).toEqual({
      totalCents: 400, paidCents: 150, pendingCents: 250,
    });
    expect(remainingCents(inst(100, 40, "2026-12-01"))).toBe(60);
  });
});

describe("serviceStatus", () => {
  it("SUSPENDIDO gana sobre todo", () => {
    expect(serviceStatus({ suspended: true, installments: [] }, today)).toBe("SUSPENDIDO");
  });
  it("VENCIDA con una cuota vencida impaga", () => {
    expect(serviceStatus({ suspended: false, installments: [inst(100, 0, "2026-10-01")] }, today)).toBe("VENCIDA");
  });
  it("ACTIVO si todo está al día", () => {
    expect(serviceStatus({ suspended: false, installments: [inst(100, 100, "2026-10-01"), inst(100, 0, "2026-11-01")] }, today)).toBe("ACTIVO");
  });
});

describe("assertPayable", () => {
  it("acepta un monto dentro del saldo", () => {
    expect(() => assertPayable(100, 100)).not.toThrow();
  });
  it("rechaza monto mayor al saldo, cero, y cuota ya pagada", () => {
    expect(() => assertPayable(100, 101)).toThrow("supera el saldo");
    expect(() => assertPayable(100, 0)).toThrow("mayor a cero");
    expect(() => assertPayable(0, 10)).toThrow("ya está pagada");
  });
});
```

`src/domain/metrics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDateInput as d } from "./dates";
import { installmentAlerts, mrrCents, realVsProjected, renewalAlerts } from "./metrics";

const today = d("2026-10-13");

describe("mrrCents", () => {
  it("suma solo activos y separa por origen", () => {
    expect(
      mrrCents([
        { kind: "SUSCRIPCION", feeCents: 400, active: true },
        { kind: "SUSCRIPCION", feeCents: 999, active: false },
        { kind: "MANTENIMIENTO", feeCents: 100, active: true },
      ]),
    ).toEqual({ subscriptionCents: 400, maintenanceCents: 100, totalCents: 500 });
  });
});

describe("realVsProjected", () => {
  it("usa el rango [from, to)", () => {
    const res = realVsProjected(
      {
        payments: [
          { amountCents: 100, paidAt: d("2026-10-01") },
          { amountCents: 50, paidAt: d("2026-11-01") },
        ],
        installments: [
          { amountCents: 300, dueDate: d("2026-10-31") },
          { amountCents: 700, dueDate: d("2026-11-01") },
        ],
      },
      d("2026-10-01"),
      d("2026-11-01"),
    );
    expect(res).toEqual({ realCents: 100, projectedCents: 300 });
  });
});

describe("installmentAlerts", () => {
  const mk = (id: string, due: string, paid = 0) => ({ id, amountCents: 100, paidCents: paid, dueDate: d(due) });
  it("separa vencidas y próximas a 7 días, ignora pagadas, ordena por fecha", () => {
    const res = installmentAlerts(
      [
        mk("vencida-b", "2026-10-10"),
        mk("vencida-a", "2026-10-01"),
        mk("hoy", "2026-10-13"),
        mk("en-7", "2026-10-20"),
        mk("en-8", "2026-10-21"),
        mk("pagada", "2026-10-01", 100),
      ],
      today,
    );
    expect(res.overdue.map((x) => x.id)).toEqual(["vencida-a", "vencida-b"]);
    expect(res.upcoming.map((x) => x.id)).toEqual(["hoy", "en-7"]);
  });
});

describe("renewalAlerts", () => {
  it("separa vencidas y próximas a 30 días", () => {
    const mk = (id: string, due: string) => ({ id, renewalDate: d(due) });
    const res = renewalAlerts(
      [mk("vencido", "2026-10-01"), mk("en-30", "2026-11-12"), mk("en-31", "2026-11-13")],
      today,
    );
    expect(res.expired.map((x) => x.id)).toEqual(["vencido"]);
    expect(res.upcoming.map((x) => x.id)).toEqual(["en-30"]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test` — Expected: FAIL (módulos `./status` y `./metrics` inexistentes).

- [ ] **Step 3: Implementar**

`src/domain/status.ts`:

```ts
export type ComputedStatus = "PENDIENTE" | "PAGADO" | "VENCIDO";
export type ServiceStatus = "ACTIVO" | "VENCIDA" | "SUSPENDIDO";

interface Dated {
  amountCents: number;
  paidCents: number;
  dueDate: Date;
}

export function installmentStatus(i: Dated, today: Date): ComputedStatus {
  if (i.paidCents >= i.amountCents) return "PAGADO";
  return i.dueDate.getTime() < today.getTime() ? "VENCIDO" : "PENDIENTE";
}

export const remainingCents = (i: { amountCents: number; paidCents: number }): number =>
  Math.max(0, i.amountCents - i.paidCents);

export function summarize(items: { amountCents: number; paidCents: number }[]) {
  const totalCents = items.reduce((s, i) => s + i.amountCents, 0);
  const paidCents = items.reduce((s, i) => s + i.paidCents, 0);
  return { totalCents, paidCents, pendingCents: totalCents - paidCents };
}

export function serviceStatus(
  a: { suspended: boolean; installments: Dated[] },
  today: Date,
): ServiceStatus {
  if (a.suspended) return "SUSPENDIDO";
  return a.installments.some((i) => installmentStatus(i, today) === "VENCIDO") ? "VENCIDA" : "ACTIVO";
}

export function assertPayable(remaining: number, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("El monto debe ser mayor a cero");
  if (remaining <= 0) throw new Error("La cuota ya está pagada");
  if (amountCents > remaining) throw new Error("El monto supera el saldo de la cuota");
}
```

`src/domain/metrics.ts`:

```ts
import { diffDays } from "./dates";

export function mrrCents(items: { kind: "SUSCRIPCION" | "MANTENIMIENTO"; feeCents: number; active: boolean }[]) {
  let subscriptionCents = 0;
  let maintenanceCents = 0;
  for (const i of items) {
    if (!i.active) continue;
    if (i.kind === "SUSCRIPCION") subscriptionCents += i.feeCents;
    else maintenanceCents += i.feeCents;
  }
  return { subscriptionCents, maintenanceCents, totalCents: subscriptionCents + maintenanceCents };
}

const inRange = (d: Date, from: Date, to: Date) => d.getTime() >= from.getTime() && d.getTime() < to.getTime();

export function realVsProjected(
  a: {
    payments: { amountCents: number; paidAt: Date }[];
    installments: { amountCents: number; dueDate: Date }[];
  },
  from: Date,
  to: Date,
) {
  const realCents = a.payments.filter((p) => inRange(p.paidAt, from, to)).reduce((s, p) => s + p.amountCents, 0);
  const projectedCents = a.installments
    .filter((i) => inRange(i.dueDate, from, to))
    .reduce((s, i) => s + i.amountCents, 0);
  return { realCents, projectedCents };
}

const byDate = <T>(get: (x: T) => Date) => (a: T, b: T) => get(a).getTime() - get(b).getTime();

export function installmentAlerts<T>(
  items: (T & { amountCents: number; paidCents: number; dueDate: Date })[],
  today: Date,
  windowDays = 7,
) {
  const unpaid = items.filter((i) => i.paidCents < i.amountCents);
  const overdue = unpaid.filter((i) => i.dueDate.getTime() < today.getTime()).sort(byDate((i) => i.dueDate));
  const upcoming = unpaid
    .filter((i) => {
      const days = diffDays(i.dueDate, today);
      return days >= 0 && days <= windowDays;
    })
    .sort(byDate((i) => i.dueDate));
  return { overdue, upcoming };
}

export function renewalAlerts<T>(items: (T & { renewalDate: Date })[], today: Date, windowDays = 30) {
  const expired = items.filter((i) => i.renewalDate.getTime() < today.getTime()).sort(byDate((i) => i.renewalDate));
  const upcoming = items
    .filter((i) => {
      const days = diffDays(i.renewalDate, today);
      return days >= 0 && days <= windowDays;
    })
    .sort(byDate((i) => i.renewalDate));
  return { expired, upcoming };
}
```
- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test` — Expected: PASS (todos los tests del dominio).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): estados, saldos, MRR, real vs proyectado y alertas"
```

---

### Task 6: Dominio — DTO del portal y etiquetas (TDD)

**Files:**
- Create: `src/domain/labels.ts`, `src/domain/portal.ts`, `src/lib/labels.ts`
- Test: `src/domain/portal.test.ts`

**Interfaces:**
- Consumes: `summarize`, `installmentStatus`, `ComputedStatus` (Task 5), `InstallmentType` (Task 4).
- Produces:

```ts
installmentLabel(type: InstallmentType, sequence: number): string
buildPortalView(input: PortalInput, today: Date): PortalView
interface PortalView { projectName; clientName; stage: string; plans: { kind: "DESARROLLO"|"SUSCRIPCION"|"MANTENIMIENTO"; totalCents; paidCents; pendingCents; pending: {label; amountCents; remainingCents; dueDate: Date; status: ComputedStatus}[]; payments: {label; amountCents; paidAt: Date}[] }[] }
```

- [ ] **Step 1: Escribir el test que falla**

`src/domain/portal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDateInput as d } from "./dates";
import { installmentLabel } from "./labels";
import { buildPortalView, type PortalInput } from "./portal";

const today = d("2026-10-13");

describe("installmentLabel", () => {
  it("etiqueta cada tipo", () => {
    expect(installmentLabel("ANTICIPO", 1)).toBe("Anticipo (50%)");
    expect(installmentLabel("CUOTA", 2)).toBe("Cuota 1");
    expect(installmentLabel("PRIMER_PAGO", 1)).toBe("Primer pago");
    expect(installmentLabel("MENSUAL", 3)).toBe("Mes 3");
    expect(installmentLabel("MANTENIMIENTO", 2)).toBe("Mantenimiento mes 2");
  });
});

describe("buildPortalView", () => {
  const input = {
    projectName: "Web Acme",
    clientName: "Acme SA",
    stage: "EN_DESARROLLO",
    internalNotes: "NOTA-INTERNA-SECRETA",
    plans: [
      {
        kind: "DESARROLLO",
        installments: [
          {
            type: "ANTICIPO", sequence: 1, amountCents: 50_000, dueDate: d("2026-10-01"), paidCents: 50_000,
            payments: [{ amountCents: 50_000, paidAt: d("2026-10-02"), receiptNote: "COMPROBANTE-SECRETO", method: "Transferencia" }],
          },
          { type: "CUOTA", sequence: 2, amountCents: 25_000, dueDate: d("2026-10-10"), paidCents: 5_000,
            payments: [{ amountCents: 5_000, paidAt: d("2026-10-11"), receiptNote: "OTRO-SECRETO" }] },
          { type: "CUOTA", sequence: 3, amountCents: 25_000, dueDate: d("2026-12-10"), paidCents: 0, payments: [] },
        ],
      },
    ],
  } as unknown as PortalInput;

  const view = buildPortalView(input, today);

  it("calcula totales y cuotas pendientes con estado", () => {
    const plan = view.plans[0];
    expect(plan).toMatchObject({ kind: "DESARROLLO", totalCents: 100_000, paidCents: 55_000, pendingCents: 45_000 });
    expect(plan.pending.map((p) => [p.label, p.remainingCents, p.status])).toEqual([
      ["Cuota 1", 20_000, "VENCIDO"],
      ["Cuota 2", 25_000, "PENDIENTE"],
    ]);
  });

  it("historial de pagos más reciente primero", () => {
    expect(view.plans[0].payments.map((p) => p.label)).toEqual(["Cuota 1", "Anticipo (50%)"]);
  });

  it("no filtra campos internos", () => {
    const json = JSON.stringify(view);
    expect(json).not.toContain("SECRETO");
    expect(json).not.toContain("receiptNote");
    expect(json).not.toContain("internalNotes");
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test src/domain/portal.test.ts` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/domain/labels.ts`:

```ts
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
```

`src/domain/portal.ts` (copia campo por campo; nunca devuelve el objeto de entrada):

```ts
import type { InstallmentType } from "./installments";
import { installmentLabel } from "./labels";
import { installmentStatus, summarize, type ComputedStatus } from "./status";

export type PlanKind = "DESARROLLO" | "SUSCRIPCION" | "MANTENIMIENTO";

export interface PortalInput {
  projectName: string;
  clientName: string;
  stage: string;
  plans: {
    kind: PlanKind;
    installments: {
      type: InstallmentType;
      sequence: number;
      amountCents: number;
      dueDate: Date;
      paidCents: number;
      payments: { amountCents: number; paidAt: Date }[];
    }[];
  }[];
}

export interface PortalPlanView {
  kind: PlanKind;
  totalCents: number;
  paidCents: number;
  pendingCents: number;
  pending: { label: string; amountCents: number; remainingCents: number; dueDate: Date; status: ComputedStatus }[];
  payments: { label: string; amountCents: number; paidAt: Date }[];
}

export interface PortalView {
  projectName: string;
  clientName: string;
  stage: string;
  plans: PortalPlanView[];
}

export function buildPortalView(input: PortalInput, today: Date): PortalView {
  return {
    projectName: input.projectName,
    clientName: input.clientName,
    stage: input.stage,
    plans: input.plans.map((plan) => {
      const { totalCents, paidCents, pendingCents } = summarize(plan.installments);
      const pending = plan.installments
        .filter((i) => i.paidCents < i.amountCents)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
        .map((i) => ({
          label: installmentLabel(i.type, i.sequence),
          amountCents: i.amountCents,
          remainingCents: i.amountCents - i.paidCents,
          dueDate: i.dueDate,
          status: installmentStatus(i, today),
        }));
      const payments = plan.installments
        .flatMap((i) =>
          i.payments.map((p) => ({
            label: installmentLabel(i.type, i.sequence),
            amountCents: p.amountCents,
            paidAt: p.paidAt,
          })),
        )
        .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
      return { kind: plan.kind, totalCents, paidCents, pendingCents, pending, payments };
    }),
  };
}
```

`src/lib/labels.ts` (etiquetas de UI, sin lógica):

```ts
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
```

- [ ] **Step 4: Ejecutar y ver que pasan**

Run: `pnpm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): DTO del portal y etiquetas"
```

---

### Task 7: Autenticación, layout del panel y componentes de formulario

**Files:**
- Create: `src/auth.config.ts`, `src/auth.ts`, `src/proxy.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/auth-guard.ts`, `src/lib/form.ts`, `src/components/action-form.tsx`, `src/components/fields.tsx`, `src/components/admin-nav.tsx`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/(admin)/layout.tsx`, `src/app/(admin)/dashboard/page.tsx` (provisorio)
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: dominio de dinero/fechas (Task 3), `prisma` (Task 2).
- Produces:
  - `requireAdmin(): Promise<{ email?: string | null; name?: string | null }>` — redirige a `/login` sin sesión.
  - `type ActionState = { error?: string; message?: string } | undefined`; `fail(error: string): ActionState`.
  - `parseForm(schema, fd)` → `{ ok: true; data } | { ok: false; error }`.
  - Esquemas Zod: `text(msg)`, `optText`, `money(msg?)` (→ centavos, > 0), `optMoney` (→ centavos | undefined), `dateField(msg?)` (→ `Date`), `optDateField`.
  - `<ActionForm action submitLabel? variant? className?>` (cliente).
  - `<Field label name type? defaultValue? required? placeholder? step?>`, `<SelectField label name options defaultValue?>`, `<TextAreaField label name defaultValue?>`.

- [ ] **Step 1: Leer las guías de autenticación**

Leer `node_modules/next/dist/docs/01-app/02-guides/authentication.md` (secciones de Server Actions, proxy y DAL). Auth.js v5 con Credentials + JWT encaja con ese patrón; si `next-auth@beta` no es compatible con Next 16.4 (error de peer o de runtime en el Step 7), usar el fallback documentado: sesión propia con cookie firmada (`jose`) siguiendo esa guía, conservando las mismas funciones `requireAdmin()` y `loginAction`.

- [ ] **Step 2: Configuración de Auth.js**

`src/auth.config.ts` (sin Prisma: lo usa el proxy):

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized: ({ auth }) => !!auth?.user,
  },
} satisfies NextAuthConfig;
```

`src/auth.ts`:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "./lib/prisma";

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(raw) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.adminUser.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        return ok ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  ],
});
```

> El seed guarda el email tal cual está en `ADMIN_EMAIL`: usar minúsculas en `.env`.

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

`src/proxy.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export const proxy = NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api/auth|login|client/view|_next/static|_next/image|favicon.ico).*)"],
};
```

`src/lib/auth-guard.ts`:

```ts
import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}
```

- [ ] **Step 3: Utilidades de formularios**

`src/lib/form.ts`:

```ts
import { z } from "zod";
import { parseDateInput } from "@/domain/dates";
import { toCents } from "@/domain/money";

export type ActionState = { error?: string; message?: string } | undefined;

export const fail = (error: string): ActionState => ({ error });

export function parseForm<S extends z.ZodType>(
  schema: S,
  fd: FormData,
): { ok: true; data: z.infer<S> } | { ok: false; error: string } {
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string"));
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false, error: result.error.issues[0]?.message ?? "Datos inválidos" };
  return { ok: true, data: result.data };
}

export const text = (msg: string) => z.string().trim().min(1, msg);
export const optText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

const centsOrNull = (v: string): number | null => {
  try {
    const c = toCents(v);
    return c > 0 ? c : null;
  } catch {
    return null;
  }
};

export const money = (msg = "Monto inválido") =>
  z
    .string()
    .trim()
    .refine((v) => centsOrNull(v) !== null, msg)
    .transform((v) => centsOrNull(v) as number);

export const optMoney = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || centsOrNull(v) !== null, "Monto inválido")
  .transform((v) => (v ? (centsOrNull(v) as number) : undefined));

const dateOrNull = (v: string): Date | null => {
  try {
    return parseDateInput(v);
  } catch {
    return null;
  }
};

export const dateField = (msg = "Fecha inválida") =>
  z
    .string()
    .refine((v) => dateOrNull(v) !== null, msg)
    .transform((v) => dateOrNull(v) as Date);

export const optDateField = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || dateOrNull(v) !== null, "Fecha inválida")
  .transform((v) => (v ? (dateOrNull(v) as Date) : null));
```

`src/components/action-form.tsx`:

```tsx
"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/form";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  submitLabel = "Guardar",
  variant = "default",
  className,
  children,
}: {
  action: Action;
  submitLabel?: string;
  variant?: "default" | "outline" | "destructive";
  className?: string;
  children?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state?.message && <p className="break-all text-sm text-green-700">{state.message}</p>}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "Procesando…" : submitLabel}
      </Button>
    </form>
  );
}
```

`src/components/fields.tsx`:

```tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function Field(p: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  placeholder?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={p.name}>{p.label}</Label>
      <Input
        id={p.name}
        name={p.name}
        type={p.type ?? "text"}
        defaultValue={p.defaultValue}
        required={p.required}
        placeholder={p.placeholder}
        step={p.step}
      />
    </div>
  );
}

export function SelectField(p: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={p.name}>{p.label}</Label>
      <select
        id={p.name}
        name={p.name}
        defaultValue={p.defaultValue}
        className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
      >
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextAreaField(p: { label: string; name: string; defaultValue?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={p.name}>{p.label}</Label>
      <Textarea id={p.name} name={p.name} defaultValue={p.defaultValue} rows={3} />
    </div>
  );
}
```

- [ ] **Step 4: Login**

`src/app/login/actions.ts`:

```ts
"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { fail, type ActionState } from "@/lib/form";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await signIn("credentials", {
      email: String(fd.get("email") ?? "").toLowerCase(),
      password: String(fd.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
  } catch (e) {
    if (e instanceof AuthError) return fail("Email o contraseña incorrectos");
    throw e;
  }
}
```

`src/app/login/page.tsx`:

```tsx
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/fields";
import { loginAction } from "./actions";

export const metadata = { title: "Ingresar — Grupo Naro", robots: { index: false } };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Grupo Naro</h1>
      <ActionForm action={loginAction} submitLabel="Ingresar">
        <Field label="Email" name="email" type="email" required />
        <Field label="Contraseña" name="password" type="password" required />
      </ActionForm>
    </main>
  );
}
```

- [ ] **Step 5: Layout del panel y navegación**

`src/components/admin-nav.tsx`:

```tsx
import Link from "next/link";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clientes" },
  { href: "/proposals", label: "Propuestas" },
  { href: "/projects", label: "Proyectos" },
  { href: "/infrastructure", label: "Infraestructura" },
];

export function AdminNav({ email }: { email: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-4 border-b p-4 md:h-screen md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0">
      <span className="text-lg font-semibold">Grupo Naro</span>
      <div className="flex flex-wrap gap-3 md:flex-col">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="text-sm hover:underline">
            {l.label}
          </Link>
        ))}
      </div>
      <form
        className="ml-auto md:mt-auto md:ml-0"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <p className="mb-2 hidden truncate text-xs text-muted-foreground md:block">{email}</p>
        <Button variant="outline" size="sm" type="submit">
          Salir
        </Button>
      </form>
    </nav>
  );
}
```

`src/app/(admin)/layout.tsx`:

```tsx
import { AdminNav } from "@/components/admin-nav";
import { requireAdmin } from "@/lib/auth-guard";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="min-h-screen md:flex">
      <AdminNav email={user.email ?? ""} />
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
```

`src/app/(admin)/dashboard/page.tsx` (provisorio, se reemplaza en Task 14):

```tsx
export default function DashboardPage() {
  return <h1 className="text-2xl font-semibold">Dashboard</h1>;
}
```

`src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

En `src/app/layout.tsx` cambiar `metadata` a `{ title: "Grupo Naro", description: "Panel interno" }` y `lang="es"`.

- [ ] **Step 6: Verificar compilación**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: sin errores. Si `pnpm build` marca `blocking-prerender-dynamic`, seguir el mensaje (ver Global Constraints).

- [ ] **Step 7: Verificación manual**

Run: `pnpm dev`. Comprobar:
1. `http://localhost:3000/dashboard` sin sesión → redirige a `/login`.
2. Login con `ADMIN_EMAIL`/`ADMIN_PASSWORD` → entra a `/dashboard` con la barra de navegación.
3. Login con clave incorrecta → muestra "Email o contraseña incorrectos".
4. "Salir" → vuelve a `/login`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: autenticación con Auth.js, proxy y layout del panel"
```

---

### Task 8: Clientes (CRUD)

**Files:**
- Create: `src/server/clients/queries.ts`, `src/server/clients/actions.ts`, `src/components/client-form.tsx`, `src/app/(admin)/clients/page.tsx`, `src/app/(admin)/clients/new/page.tsx`, `src/app/(admin)/clients/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `parseForm`, `text`, `optText`, `fail`, `ActionState`, `ActionForm`, `Field`, `TextAreaField`.
- Produces: `listClients()`, `getClient(id)`; acciones `createClient(prev, fd)`, `updateClient(id, prev, fd)`, `deleteClient(id, prev, fd)`.

- [ ] **Step 1: Consultas**

`src/server/clients/queries.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";

export const listClients = () =>
  prisma.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } } } });

export const getClient = (id: string) =>
  prisma.client.findUnique({
    where: { id },
    include: {
      projects: { orderBy: { createdAt: "desc" } },
      proposals: { orderBy: { createdAt: "desc" } },
    },
  });
```

- [ ] **Step 2: Acciones**

`src/server/clients/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, optText, parseForm, text, type ActionState } from "@/lib/form";

const schema = z.object({
  name: text("El nombre es obligatorio"),
  contactName: optText,
  email: optText,
  phone: optText,
  taxId: optText,
  notes: optText,
});

export async function createClient(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const client = await prisma.client.create({ data: parsed.data });
  revalidatePath("/clients");
  redirect(`/clients/${client.id}`);
}

export async function updateClient(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return fail(parsed.error);
  await prisma.client.update({ where: { id }, data: parsed.data });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { message: "Cambios guardados" };
}

export async function deleteClient(id: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const [projects, proposals] = await Promise.all([
    prisma.project.count({ where: { clientId: id } }),
    prisma.proposal.count({ where: { clientId: id } }),
  ]);
  if (projects + proposals > 0) return fail("No se puede eliminar: tiene proyectos o propuestas");
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
  redirect("/clients");
}
```

- [ ] **Step 3: Formulario y páginas**

`src/components/client-form.tsx`:

```tsx
import { ActionForm } from "@/components/action-form";
import { Field, TextAreaField } from "@/components/fields";
import type { ActionState } from "@/lib/form";

type Client = {
  name: string; contactName: string | null; email: string | null;
  phone: string | null; taxId: string | null; notes: string | null;
};

export function ClientForm({
  action,
  client,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  client?: Client;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} className="max-w-lg space-y-3">
      <Field label="Nombre / Razón social" name="name" defaultValue={client?.name} required />
      <Field label="Contacto" name="contactName" defaultValue={client?.contactName ?? ""} />
      <Field label="Email" name="email" type="email" defaultValue={client?.email ?? ""} />
      <Field label="Teléfono" name="phone" defaultValue={client?.phone ?? ""} />
      <Field label="CUIT / DNI" name="taxId" defaultValue={client?.taxId ?? ""} />
      <TextAreaField label="Notas internas" name="notes" defaultValue={client?.notes ?? ""} />
    </ActionForm>
  );
}
```

`src/app/(admin)/clients/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listClients } from "@/server/clients/queries";

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Button asChild>
          <Link href="/clients/new">Nuevo cliente</Link>
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {clients.length === 0 && <li className="p-4 text-sm text-muted-foreground">Todavía no hay clientes.</li>}
        {clients.map((c) => (
          <li key={c.id}>
            <Link href={`/clients/${c.id}`} className="flex justify-between p-4 hover:bg-muted">
              <span>{c.name}</span>
              <span className="text-sm text-muted-foreground">{c._count.projects} proyecto(s)</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> Si el `Button` generado por shadcn no soporta `asChild` (depende del preset), reemplazar por `<Link className="...">` con las clases de botón.

`src/app/(admin)/clients/new/page.tsx`:

```tsx
import { ClientForm } from "@/components/client-form";
import { createClient } from "@/server/clients/actions";

export default function NewClientPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
      <ClientForm action={createClient} submitLabel="Crear cliente" />
    </div>
  );
}
```

`src/app/(admin)/clients/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { ClientForm } from "@/components/client-form";
import { CONTRACT_LABEL, PROPOSAL_LABEL, STAGE_LABEL } from "@/lib/labels";
import { deleteClient, updateClient } from "@/server/clients/actions";
import { getClient } from "@/server/clients/queries";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{client.name}</h1>
      <ClientForm action={updateClient.bind(null, id)} client={client} submitLabel="Guardar cambios" />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Proyectos</h2>
        <ul className="divide-y rounded-md border">
          {client.projects.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin proyectos.</li>}
          {client.projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="flex justify-between p-3 hover:bg-muted">
                <span>{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {CONTRACT_LABEL[p.contractType]} · {STAGE_LABEL[p.stage]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Propuestas</h2>
        <ul className="divide-y rounded-md border">
          {client.proposals.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin propuestas.</li>}
          {client.proposals.map((p) => (
            <li key={p.id}>
              <Link href={`/proposals/${p.id}`} className="flex justify-between p-3 hover:bg-muted">
                <span>{p.title}</span>
                <span className="text-sm text-muted-foreground">{PROPOSAL_LABEL[p.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ActionForm action={deleteClient.bind(null, id)} submitLabel="Eliminar cliente" variant="destructive" />
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm build` — Expected: sin errores.
Manual (`pnpm dev`): crear cliente "Acme SA" → aparece en la lista; editarlo y ver "Cambios guardados"; el nombre vacío muestra "El nombre es obligatorio" (quitar `required` en DevTools para probarlo); eliminar un cliente sin proyectos lo borra.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: gestión de clientes"
```

---

### Task 9: Propuestas y creación de proyectos

**Files:**
- Create: `src/server/projects/create.ts`, `src/server/projects/queries.ts`, `src/server/projects/actions.ts`, `src/server/proposals/queries.ts`, `src/server/proposals/actions.ts`, `src/app/(admin)/proposals/page.tsx`, `src/app/(admin)/proposals/new/page.tsx`, `src/app/(admin)/proposals/[id]/page.tsx`, `src/app/(admin)/projects/page.tsx`, `src/app/(admin)/projects/new/page.tsx`

**Interfaces:**
- Consumes: Task 7 (form utils), Task 2 (`centsToDec`, `decToCents`), Task 6 (`lib/labels`).
- Produces:
  - `createProjectRecord(db: Pick<PrismaClient, "project">, input: NewProject): Promise<Project>` y `validateNewProject(input: NewProject): string | null`, con `NewProject = { clientId; proposalId?; name; contractType; totalCents?; monthlyFeeCents?; firstPaymentCents? }`.
  - `createProject(prev, fd)`, `setProjectStage(projectId, prev, fd)`.
  - `createProposal(prev, fd)`, `setProposalStatus(id, status, prev, fd)`, `acceptProposal(id, prev, fd)`.

- [ ] **Step 1: Creación de proyectos (compartida)**

`src/server/projects/create.ts`:

```ts
import "server-only";
import type { PrismaClient } from "@prisma/client";
import { centsToDec } from "@/server/mappers";

export interface NewProject {
  clientId: string;
  proposalId?: string;
  name: string;
  contractType: "PAGO_UNICO" | "SUSCRIPCION";
  totalCents?: number;
  monthlyFeeCents?: number;
  firstPaymentCents?: number;
}

export function validateNewProject(i: NewProject): string | null {
  if (i.contractType === "PAGO_UNICO" && !i.totalCents) return "El Pago Único requiere un monto total";
  if (i.contractType === "SUSCRIPCION" && (!i.monthlyFeeCents || !i.firstPaymentCents)) {
    return "La Suscripción requiere abono mensual y primer pago";
  }
  return null;
}

export function createProjectRecord(db: Pick<PrismaClient, "project">, i: NewProject) {
  const dec = (c?: number) => (c ? centsToDec(c) : undefined);
  return db.project.create({
    data: {
      clientId: i.clientId,
      proposalId: i.proposalId,
      name: i.name,
      contractType: i.contractType,
      codeOwner: i.contractType === "PAGO_UNICO" ? "CLIENTE" : "NARO",
      totalAmount: i.contractType === "PAGO_UNICO" ? dec(i.totalCents) : undefined,
      monthlyFee: i.contractType === "SUSCRIPCION" ? dec(i.monthlyFeeCents) : undefined,
      firstPaymentAmount: i.contractType === "SUSCRIPCION" ? dec(i.firstPaymentCents) : undefined,
    },
  });
}
```

- [ ] **Step 2: Acciones de proyecto**

`src/server/projects/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, optMoney, parseForm, text, type ActionState } from "@/lib/form";
import { todayAR } from "@/domain/dates";
import { createProjectRecord, validateNewProject } from "./create";

const newProjectSchema = z.object({
  clientId: text("Elegí un cliente"),
  name: text("El nombre es obligatorio"),
  contractType: z.enum(["PAGO_UNICO", "SUSCRIPCION"]),
  total: optMoney,
  monthlyFee: optMoney,
  firstPayment: optMoney,
});

export async function createProject(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(newProjectSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const d = parsed.data;
  const input = {
    clientId: d.clientId,
    name: d.name,
    contractType: d.contractType,
    totalCents: d.total,
    monthlyFeeCents: d.monthlyFee,
    firstPaymentCents: d.firstPayment,
  };
  const problem = validateNewProject(input);
  if (problem) return fail(problem);
  const project = await createProjectRecord(prisma, input);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

const stageSchema = z.object({
  stage: z.enum(["COTIZACION", "EN_DESARROLLO", "ENTREGADO", "EN_MANTENIMIENTO"]),
});

export async function setProjectStage(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(stageSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return fail("Proyecto no encontrado");
  const today = todayAR();
  await prisma.project.update({
    where: { id: projectId },
    data: {
      stage: parsed.data.stage,
      startedAt: parsed.data.stage === "EN_DESARROLLO" && !project.startedAt ? today : undefined,
      deliveredAt: parsed.data.stage === "ENTREGADO" && !project.deliveredAt ? today : undefined,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { message: "Etapa actualizada" };
}
```

- [ ] **Step 3: Consultas de proyectos**

`src/server/projects/queries.ts`:

```ts
import "server-only";
import type { ProjectStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

export const listProjects = (stage?: ProjectStage) =>
  prisma.project.findMany({
    where: stage ? { stage } : undefined,
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, name: true } } },
  });

export async function getProject(id: string) {
  const p = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      plans: { select: { id: true, kind: true } },
      assets: { orderBy: { renewalDate: "asc" } },
      tokens: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) return null;
  const cents = (d: typeof p.totalAmount) => (d ? decToCents(d) : null);
  return {
    ...p,
    totalCents: cents(p.totalAmount),
    monthlyFeeCents: cents(p.monthlyFee),
    firstPaymentCents: cents(p.firstPaymentAmount),
    maintenanceFeeCents: cents(p.maintenanceFee),
  };
}
```

- [ ] **Step 4: Propuestas — consultas y acciones**

`src/server/proposals/queries.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";

export const listProposals = () =>
  prisma.proposal.findMany({ orderBy: { createdAt: "desc" }, include: { client: { select: { name: true } } } });

export const getProposal = (id: string) =>
  prisma.proposal.findUnique({ where: { id }, include: { client: true, project: { select: { id: true } } } });
```

`src/server/proposals/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, money, optDateField, optMoney, optText, parseForm, text, type ActionState } from "@/lib/form";
import { centsToDec } from "@/server/mappers";
import { createProjectRecord, validateNewProject } from "@/server/projects/create";

const proposalSchema = z.object({
  clientId: text("Elegí un cliente"),
  title: text("El título es obligatorio"),
  scope: optText,
  oneTimePrice: money("Precio de Pago Único inválido"),
  monthlyFee: money("Abono mensual inválido"),
  validUntil: optDateField,
});

export async function createProposal(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(proposalSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const { oneTimePrice, monthlyFee, ...rest } = parsed.data;
  const proposal = await prisma.proposal.create({
    data: { ...rest, oneTimePrice: centsToDec(oneTimePrice), monthlyFee: centsToDec(monthlyFee) },
  });
  revalidatePath("/proposals");
  redirect(`/proposals/${proposal.id}`);
}

export async function setProposalStatus(
  id: string,
  status: "ENVIADA" | "RECHAZADA",
  _prev: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal) return fail("Propuesta no encontrada");
  if (proposal.status === "ACEPTADA") return fail("La propuesta ya fue aceptada");
  await prisma.proposal.update({ where: { id }, data: { status } });
  revalidatePath(`/proposals/${id}`);
  revalidatePath("/proposals");
  return { message: "Estado actualizado" };
}

const acceptSchema = z.object({
  model: z.enum(["PAGO_UNICO", "SUSCRIPCION"]),
  total: optMoney,
  monthlyFee: optMoney,
  firstPayment: optMoney,
});

export async function acceptProposal(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(acceptSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const proposal = await prisma.proposal.findUnique({ where: { id } });
  if (!proposal) return fail("Propuesta no encontrada");
  if (proposal.status === "ACEPTADA") return fail("La propuesta ya fue aceptada");
  const d = parsed.data;
  const input = {
    clientId: proposal.clientId,
    proposalId: id,
    name: proposal.title,
    contractType: d.model,
    totalCents: d.total,
    monthlyFeeCents: d.monthlyFee,
    firstPaymentCents: d.firstPayment,
  };
  const problem = validateNewProject(input);
  if (problem) return fail(problem);
  const project = await prisma.$transaction(async (tx) => {
    await tx.proposal.update({ where: { id }, data: { status: "ACEPTADA", acceptedModel: d.model } });
    return createProjectRecord(tx, input);
  });
  revalidatePath("/proposals");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
```

- [ ] **Step 5: Páginas de propuestas**

`src/app/(admin)/proposals/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatARS } from "@/domain/money";
import { PROPOSAL_LABEL } from "@/lib/labels";
import { decToCents } from "@/server/mappers";
import { listProposals } from "@/server/proposals/queries";

export default async function ProposalsPage() {
  const proposals = await listProposals();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Propuestas</h1>
        <Button asChild>
          <Link href="/proposals/new">Nueva propuesta</Link>
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {proposals.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin propuestas.</li>}
        {proposals.map((p) => (
          <li key={p.id}>
            <Link href={`/proposals/${p.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-muted">
              <span>
                {p.title} <span className="text-sm text-muted-foreground">— {p.client.name}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {formatARS(decToCents(p.oneTimePrice))} único · {formatARS(decToCents(p.monthlyFee))}/mes ·{" "}
                {PROPOSAL_LABEL[p.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/(admin)/proposals/new/page.tsx`:

```tsx
import { ActionForm } from "@/components/action-form";
import { Field, SelectField, TextAreaField } from "@/components/fields";
import { createProposal } from "@/server/proposals/actions";
import { listClients } from "@/server/clients/queries";

export default async function NewProposalPage() {
  const clients = await listClients();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nueva propuesta</h1>
      <ActionForm action={createProposal} submitLabel="Crear propuesta" className="max-w-lg space-y-3">
        <SelectField
          label="Cliente"
          name="clientId"
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Field label="Título" name="title" required />
        <TextAreaField label="Alcance" name="scope" />
        <Field label="Precio Pago Único (ARS)" name="oneTimePrice" type="number" step="0.01" required />
        <Field label="Abono mensual Suscripción (ARS)" name="monthlyFee" type="number" step="0.01" required />
        <Field label="Válida hasta" name="validUntil" type="date" />
      </ActionForm>
      {clients.length === 0 && <p className="text-sm text-red-600">Primero creá un cliente.</p>}
    </div>
  );
}
```

`src/app/(admin)/proposals/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { formatARS } from "@/domain/money";
import { PROPOSAL_LABEL } from "@/lib/labels";
import { decToCents } from "@/server/mappers";
import { acceptProposal, setProposalStatus } from "@/server/proposals/actions";
import { getProposal } from "@/server/proposals/queries";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getProposal(id);
  if (!p) notFound();
  const oneTime = decToCents(p.oneTimePrice);
  const monthly = decToCents(p.monthlyFee);
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <p className="text-sm text-muted-foreground">
          {p.client.name} · {PROPOSAL_LABEL[p.status]}
        </p>
      </div>
      {p.scope && <p className="whitespace-pre-wrap text-sm">{p.scope}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Opción A — Pago Único</p>
          <p className="text-xl font-semibold">{formatARS(oneTime)}</p>
          <p className="text-xs text-muted-foreground">50% de anticipo + resto en 2 o 3 cuotas</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Opción B — Suscripción</p>
          <p className="text-xl font-semibold">{formatARS(monthly)}/mes</p>
          <p className="text-xs text-muted-foreground">El primer pago se define al aceptar</p>
        </div>
      </div>

      {p.status === "ACEPTADA" ? (
        <p className="text-sm">
          Aceptada.{" "}
          {p.project && (
            <Link className="underline" href={`/projects/${p.project.id}`}>
              Ver proyecto
            </Link>
          )}
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <ActionForm action={setProposalStatus.bind(null, id, "ENVIADA")} submitLabel="Marcar enviada" variant="outline" />
            <ActionForm action={setProposalStatus.bind(null, id, "RECHAZADA")} submitLabel="Marcar rechazada" variant="outline" />
          </div>
          <section className="space-y-3 rounded-md border p-4">
            <h2 className="text-lg font-medium">Aceptar y crear proyecto</h2>
            <ActionForm action={acceptProposal.bind(null, id)} submitLabel="Aceptar propuesta">
              <SelectField
                label="Modelo elegido"
                name="model"
                options={[
                  { value: "PAGO_UNICO", label: "Pago Único" },
                  { value: "SUSCRIPCION", label: "Suscripción" },
                ]}
              />
              <Field label="Total Pago Único (ARS)" name="total" type="number" step="0.01" defaultValue={oneTime / 100} />
              <Field label="Abono mensual (ARS)" name="monthlyFee" type="number" step="0.01" defaultValue={monthly / 100} />
              <Field label="Primer pago Suscripción (ARS)" name="firstPayment" type="number" step="0.01" placeholder="ej. 600000" />
            </ActionForm>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Páginas de proyectos (lista y alta)**

`src/app/(admin)/projects/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CONTRACT_LABEL, STAGE_LABEL } from "@/lib/labels";
import { listProjects } from "@/server/projects/queries";

const STAGES = Object.keys(STAGE_LABEL) as (keyof typeof STAGE_LABEL)[];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { stage } = await searchParams;
  const active = STAGES.find((s) => s === stage);
  const projects = await listProjects(active);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proyectos</h1>
        <Button asChild>
          <Link href="/projects/new">Nuevo proyecto</Link>
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/projects" className={!active ? "font-semibold underline" : ""}>Todos</Link>
        {STAGES.map((s) => (
          <Link key={s} href={`/projects?stage=${s}`} className={active === s ? "font-semibold underline" : ""}>
            {STAGE_LABEL[s]}
          </Link>
        ))}
      </div>
      <ul className="divide-y rounded-md border">
        {projects.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin proyectos.</li>}
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/projects/${p.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-muted">
              <span>
                {p.name} <span className="text-sm text-muted-foreground">— {p.client.name}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {CONTRACT_LABEL[p.contractType]} · {STAGE_LABEL[p.stage]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/(admin)/projects/new/page.tsx`:

```tsx
import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { listClients } from "@/server/clients/queries";
import { createProject } from "@/server/projects/actions";

export default async function NewProjectPage() {
  const clients = await listClients();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nuevo proyecto</h1>
      <p className="text-sm text-muted-foreground">
        Para proyectos que vienen de una propuesta, aceptala desde Propuestas.
      </p>
      <ActionForm action={createProject} submitLabel="Crear proyecto" className="max-w-lg space-y-3">
        <SelectField label="Cliente" name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Field label="Nombre del proyecto" name="name" required />
        <SelectField
          label="Tipo de contrato"
          name="contractType"
          options={[
            { value: "PAGO_UNICO", label: "Pago Único" },
            { value: "SUSCRIPCION", label: "Suscripción" },
          ]}
        />
        <Field label="Total Pago Único (ARS)" name="total" type="number" step="0.01" />
        <Field label="Abono mensual (ARS)" name="monthlyFee" type="number" step="0.01" />
        <Field label="Primer pago Suscripción (ARS)" name="firstPayment" type="number" step="0.01" />
      </ActionForm>
    </div>
  );
}
```

- [ ] **Step 7: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm build` — Expected: sin errores (aún falta `/projects/[id]`, que se crea en Task 10; enlaces a esa ruta no rompen el build).
Manual: crear propuesta ($1.000.000 único / $400.000 mensual) → aceptar como Suscripción con primer pago $600.000 → redirige a `/projects/<id>` (404 hasta Task 10; confirmar en Prisma Studio `pnpm exec prisma studio` que el `Project` existe con `monthlyFee=400000.00`, `firstPaymentAmount=600000.00`, `codeOwner=NARO`). Aceptarla de nuevo muestra "La propuesta ya fue aceptada". Aceptar como Suscripción sin primer pago muestra el error de validación.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: propuestas, aceptación y alta de proyectos"
```

---

### Task 10: Ficha de proyecto (cabecera, etapa y estructura)

**Files:**
- Create: `src/app/(admin)/projects/[id]/page.tsx`, `src/components/project/project-header.tsx`

**Interfaces:**
- Consumes: `getProject` (Task 9), `setProjectStage` (Task 9), etiquetas (Task 6). Las secciones `BillingSection`, `InfraSection`, `PortalSection` se agregan en las Tasks 11-15; esta tarea deja la página con la cabecera y los puntos de montaje.
- Produces: `<ProjectHeader project>`; ruta `/projects/[id]`.

- [ ] **Step 1: Cabecera**

`src/components/project/project-header.tsx`:

```tsx
import { ActionForm } from "@/components/action-form";
import { SelectField } from "@/components/fields";
import { formatARS } from "@/domain/money";
import { CONTRACT_LABEL, OWNER_LABEL, STAGE_LABEL } from "@/lib/labels";
import { setProjectStage } from "@/server/projects/actions";

type Props = {
  project: {
    id: string;
    name: string;
    stage: keyof typeof STAGE_LABEL;
    contractType: keyof typeof CONTRACT_LABEL;
    codeOwner: keyof typeof OWNER_LABEL;
    client: { id: string; name: string };
    totalCents: number | null;
    monthlyFeeCents: number | null;
  };
};

export function ProjectHeader({ project }: Props) {
  return (
    <header className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          {project.client.name} · {CONTRACT_LABEL[project.contractType]} · Código de:{" "}
          {OWNER_LABEL[project.codeOwner]}
          {project.totalCents ? ` · Total ${formatARS(project.totalCents)}` : ""}
          {project.monthlyFeeCents ? ` · Abono ${formatARS(project.monthlyFeeCents)}/mes` : ""}
        </p>
      </div>
      <ActionForm
        action={setProjectStage.bind(null, project.id)}
        submitLabel="Cambiar etapa"
        variant="outline"
        className="flex max-w-md items-end gap-3"
      >
        <SelectField
          label="Etapa"
          name="stage"
          defaultValue={project.stage}
          options={Object.entries(STAGE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      </ActionForm>
    </header>
  );
}
```

- [ ] **Step 2: Página**

`src/app/(admin)/projects/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { ProjectHeader } from "@/components/project/project-header";
import { getProject } from "@/server/projects/queries";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <div className="space-y-8">
      <ProjectHeader project={project} />
      {/* BillingSection (Task 11) · InfraSection (Task 13) · PortalSection (Task 15) */}
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck && pnpm build` — Expected: sin errores.
Manual: abrir el proyecto creado en Task 9 → se ve cabecera con "Grupo Naro" como dueño del código y abono; cambiar etapa a "En Desarrollo" muestra "Etapa actualizada" y `startedAt` queda cargado (Prisma Studio).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: ficha de proyecto con cabecera y cambio de etapa"
```

---

### Task 11: Plan de cobros y registro de pagos (núcleo)

**Files:**
- Create: `src/server/billing/recalc.ts`, `src/server/billing/queries.ts`, `src/server/billing/actions.ts`, `src/components/project/billing-section.tsx`
- Modify: `src/app/(admin)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `planOneTime`, `planSubscription` (Task 4); `installmentStatus`, `summarize`, `remainingCents`, `assertPayable` (Task 5); `decToCents`, `centsToDec` (Task 2); `todayAR`, `toDateInput` (Task 3).
- Produces:

```ts
// queries.ts
interface PaymentRow { id: string; amountCents: number; paidAt: Date; method: string; receiptNote: string | null }
interface InstallmentRow { id: string; planId: string; type: InstallmentType; sequence: number; amountCents: number; dueDate: Date; paidCents: number; status: ComputedStatus; payments: PaymentRow[] }
interface PlanRow { id: string; kind: PlanKind; installments: InstallmentRow[]; summary: { totalCents: number; paidCents: number; pendingCents: number } }
getProjectBilling(projectId: string): Promise<PlanRow[]>
// recalc.ts
recalcInstallment(tx: Prisma.TransactionClient, installmentId: string): Promise<void>
// actions.ts
createDevelopmentPlan(projectId, prev, fd), createSubscriptionPlan(projectId, prev, fd),
updateInstallment(installmentId, prev, fd), registerPayment(installmentId, prev, fd), deletePayment(paymentId, prev, fd)
```

- [ ] **Step 1: Recalcular estado guardado**

`src/server/billing/recalc.ts`:

```ts
import "server-only";
import type { Prisma } from "@prisma/client";
import { decToCents } from "@/server/mappers";

/** Deja `status` en PAGADO si la suma de pagos cubre el monto; si no, PENDIENTE. */
export async function recalcInstallment(tx: Prisma.TransactionClient, installmentId: string) {
  const inst = await tx.installment.findUniqueOrThrow({
    where: { id: installmentId },
    include: { payments: true },
  });
  const paid = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
  const status = paid >= decToCents(inst.amount) ? "PAGADO" : "PENDIENTE";
  if (status !== inst.status) await tx.installment.update({ where: { id: installmentId }, data: { status } });
}
```

- [ ] **Step 2: Consulta de cobros**

`src/server/billing/queries.ts`:

```ts
import "server-only";
import { todayAR } from "@/domain/dates";
import type { InstallmentType } from "@/domain/installments";
import type { PlanKind } from "@/domain/portal";
import { installmentStatus, summarize, type ComputedStatus } from "@/domain/status";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

export interface PaymentRow {
  id: string;
  amountCents: number;
  paidAt: Date;
  method: string;
  receiptNote: string | null;
}
export interface InstallmentRow {
  id: string;
  planId: string;
  type: InstallmentType;
  sequence: number;
  amountCents: number;
  dueDate: Date;
  paidCents: number;
  status: ComputedStatus;
  payments: PaymentRow[];
}
export interface PlanRow {
  id: string;
  kind: PlanKind;
  installments: InstallmentRow[];
  summary: { totalCents: number; paidCents: number; pendingCents: number };
}

export async function getProjectBilling(projectId: string, today = todayAR()): Promise<PlanRow[]> {
  const plans = await prisma.installmentPlan.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    include: {
      installments: {
        orderBy: { sequence: "asc" },
        include: { payments: { orderBy: { paidAt: "asc" } } },
      },
    },
  });
  return plans.map((plan) => {
    const installments = plan.installments.map((i): InstallmentRow => {
      const amountCents = decToCents(i.amount);
      const payments = i.payments.map((p) => ({
        id: p.id,
        amountCents: decToCents(p.amount),
        paidAt: p.paidAt,
        method: p.method,
        receiptNote: p.receiptNote,
      }));
      const paidCents = payments.reduce((s, p) => s + p.amountCents, 0);
      return {
        id: i.id,
        planId: plan.id,
        type: i.type,
        sequence: i.sequence,
        amountCents,
        dueDate: i.dueDate,
        paidCents,
        status: installmentStatus({ amountCents, paidCents, dueDate: i.dueDate }, today),
        payments,
      };
    });
    return { id: plan.id, kind: plan.kind, installments, summary: summarize(installments) };
  });
}
```

- [ ] **Step 3: Acciones**

`src/server/billing/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { dateField, fail, money, optText, parseForm, text, type ActionState } from "@/lib/form";
import { planOneTime, planSubscription, type InstallmentDraft } from "@/domain/installments";
import { assertPayable, remainingCents } from "@/domain/status";
import { centsToDec, decToCents } from "@/server/mappers";
import { recalcInstallment } from "./recalc";

const toCreate = (d: InstallmentDraft) => ({
  type: d.type,
  sequence: d.sequence,
  amount: centsToDec(d.amountCents),
  dueDate: d.dueDate,
});

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`);

export async function createDevelopmentPlan(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(
    z.object({ total: money("Total inválido"), count: z.enum(["2", "3"]), startDate: dateField() }),
    fd,
  );
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "PAGO_UNICO") return fail("El proyecto no es de Pago Único");
  if (project.plans.some((p) => p.kind === "DESARROLLO")) return fail("Ya existe un plan de desarrollo");
  const { total, count, startDate } = parsed.data;
  const drafts = planOneTime({ totalCents: total, count: Number(count), startDate });
  await prisma.$transaction([
    prisma.project.update({ where: { id: projectId }, data: { totalAmount: centsToDec(total) } }),
    prisma.installmentPlan.create({
      data: {
        projectId,
        kind: "DESARROLLO",
        totalAmount: centsToDec(total),
        installmentCount: Number(count),
        installments: { create: drafts.map(toCreate) },
      },
    }),
  ]);
  refresh(projectId);
  return { message: "Plan de cobros creado" };
}

export async function createSubscriptionPlan(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(
    z.object({ monthlyFee: money("Abono inválido"), firstPayment: money("Primer pago inválido"), firstDueDate: dateField() }),
    fd,
  );
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "SUSCRIPCION") return fail("El proyecto no es una Suscripción");
  if (project.plans.some((p) => p.kind === "SUSCRIPCION")) return fail("Ya existe un plan de suscripción");
  const { monthlyFee, firstPayment, firstDueDate } = parsed.data;
  const drafts = planSubscription({ monthlyFeeCents: monthlyFee, firstPaymentCents: firstPayment, firstDueDate });
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: { monthlyFee: centsToDec(monthlyFee), firstPaymentAmount: centsToDec(firstPayment) },
    }),
    prisma.installmentPlan.create({
      data: { projectId, kind: "SUSCRIPCION", installments: { create: drafts.map(toCreate) } },
    }),
  ]);
  refresh(projectId);
  return { message: "Plan de suscripción creado" };
}

export async function updateInstallment(installmentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(z.object({ amount: money(), dueDate: dateField() }), fd);
  if (!parsed.ok) return fail(parsed.error);
  const inst = await prisma.installment.findUnique({
    where: { id: installmentId },
    include: { payments: true, plan: true },
  });
  if (!inst) return fail("Cuota no encontrada");
  const paid = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
  if (parsed.data.amount < paid) return fail("El monto no puede ser menor a lo ya pagado");
  await prisma.$transaction(async (tx) => {
    await tx.installment.update({
      where: { id: installmentId },
      data: { amount: centsToDec(parsed.data.amount), dueDate: parsed.data.dueDate },
    });
    await recalcInstallment(tx, installmentId);
  });
  refresh(inst.plan.projectId);
  return { message: "Cuota actualizada" };
}

const paymentSchema = z.object({
  amount: money(),
  paidAt: dateField("Fecha de pago inválida"),
  method: text("Elegí un método"),
  receiptNote: optText,
});

export async function registerPayment(installmentId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(paymentSchema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const inst = await prisma.installment.findUnique({
    where: { id: installmentId },
    include: { payments: true, plan: true },
  });
  if (!inst) return fail("Cuota no encontrada");
  const paidCents = inst.payments.reduce((s, p) => s + decToCents(p.amount), 0);
  try {
    assertPayable(remainingCents({ amountCents: decToCents(inst.amount), paidCents }), parsed.data.amount);
  } catch (e) {
    return fail((e as Error).message);
  }
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        installmentId,
        amount: centsToDec(parsed.data.amount),
        paidAt: parsed.data.paidAt,
        method: parsed.data.method,
        receiptNote: parsed.data.receiptNote,
      },
    });
    await recalcInstallment(tx, installmentId);
  });
  refresh(inst.plan.projectId);
  return { message: "Pago registrado" };
}

export async function deletePayment(paymentId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { installment: { include: { plan: true } } },
  });
  if (!payment) return fail("Pago no encontrado");
  await prisma.$transaction(async (tx) => {
    await tx.payment.delete({ where: { id: paymentId } });
    await recalcInstallment(tx, payment.installmentId);
  });
  refresh(payment.installment.plan.projectId);
  return { message: "Pago eliminado" };
}
```

- [ ] **Step 4: Sección de cobros**

`src/components/project/billing-section.tsx` (esta versión cubre planes, tabla, pagos y edición; el mantenimiento y los ajustes se agregan en Task 12):

```tsx
import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { toDateInput, todayAR, formatDate } from "@/domain/dates";
import { installmentLabel } from "@/domain/labels";
import { formatARS } from "@/domain/money";
import { PAYMENT_METHODS, PLAN_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/labels";
import type { InstallmentRow, PlanRow } from "@/server/billing/queries";
import {
  createDevelopmentPlan,
  createSubscriptionPlan,
  deletePayment,
  registerPayment,
  updateInstallment,
} from "@/server/billing/actions";
import { setProjectStage } from "@/server/projects/actions";

export interface BillingProject {
  id: string;
  contractType: "PAGO_UNICO" | "SUSCRIPCION";
  stage: "COTIZACION" | "EN_DESARROLLO" | "ENTREGADO" | "EN_MANTENIMIENTO";
  totalCents: number | null;
  monthlyFeeCents: number | null;
  firstPaymentCents: number | null;
}

const centsToInput = (c: number | null) => (c ? c / 100 : undefined);

function InstallmentRowView({ i }: { i: InstallmentRow }) {
  const remaining = i.amountCents - i.paidCents;
  return (
    <tr className="border-t align-top">
      <td className="p-2">{installmentLabel(i.type, i.sequence)}</td>
      <td className="p-2">{formatDate(i.dueDate)}</td>
      <td className="p-2 text-right">{formatARS(i.amountCents)}</td>
      <td className="p-2 text-right">{formatARS(i.paidCents)}</td>
      <td className="p-2">
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[i.status]}`}>{STATUS_LABEL[i.status]}</span>
      </td>
      <td className="space-y-2 p-2">
        {i.payments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
            <span>
              {formatDate(p.paidAt)} · {formatARS(p.amountCents)} · {p.method}
              {p.receiptNote ? ` · ${p.receiptNote}` : ""}
            </span>
            <ActionForm action={deletePayment.bind(null, p.id)} submitLabel="Quitar" variant="outline" className="shrink-0" />
          </div>
        ))}
        {remaining > 0 && (
          <details>
            <summary className="cursor-pointer text-sm underline">Registrar pago</summary>
            <ActionForm action={registerPayment.bind(null, i.id)} submitLabel="Registrar pago" className="mt-2 space-y-2">
              <Field label="Monto (ARS)" name="amount" type="number" step="0.01" defaultValue={remaining / 100} required />
              <Field label="Fecha de pago" name="paidAt" type="date" defaultValue={toDateInput(todayAR())} required />
              <SelectField label="Método" name="method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))} />
              <Field label="Comprobante / nota" name="receiptNote" />
            </ActionForm>
          </details>
        )}
        {i.paidCents === 0 && (
          <details>
            <summary className="cursor-pointer text-sm underline">Editar cuota</summary>
            <ActionForm action={updateInstallment.bind(null, i.id)} submitLabel="Guardar cuota" className="mt-2 space-y-2">
              <Field label="Monto (ARS)" name="amount" type="number" step="0.01" defaultValue={i.amountCents / 100} required />
              <Field label="Vencimiento" name="dueDate" type="date" defaultValue={toDateInput(i.dueDate)} required />
            </ActionForm>
          </details>
        )}
      </td>
    </tr>
  );
}

export function BillingSection({ project, plans }: { project: BillingProject; plans: PlanRow[] }) {
  const hasDev = plans.some((p) => p.kind === "DESARROLLO");
  const hasSub = plans.some((p) => p.kind === "SUSCRIPCION");
  const dev = plans.find((p) => p.kind === "DESARROLLO");
  const anticipoPaid = dev?.installments.find((i) => i.type === "ANTICIPO")?.status === "PAGADO";

  return (
    <section className="space-y-6">
      <h2 className="text-xl font-semibold">Cobros</h2>

      {project.stage === "COTIZACION" && anticipoPaid && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm">
          <span>Anticipo cobrado: ya se puede iniciar el desarrollo.</span>
          <ActionForm action={setProjectStage.bind(null, project.id)} submitLabel="Pasar a En Desarrollo" className="flex items-center gap-2">
            <input type="hidden" name="stage" value="EN_DESARROLLO" />
          </ActionForm>
        </div>
      )}

      {project.contractType === "PAGO_UNICO" && !hasDev && (
        <div className="max-w-md space-y-2 rounded-md border p-4">
          <h3 className="font-medium">Crear plan de cobros (50% anticipo + cuotas)</h3>
          <ActionForm action={createDevelopmentPlan.bind(null, project.id)} submitLabel="Crear plan">
            <Field label="Total (ARS)" name="total" type="number" step="0.01" defaultValue={centsToInput(project.totalCents)} required />
            <SelectField label="Cuotas del 50% restante" name="count" options={[{ value: "2", label: "2 cuotas" }, { value: "3", label: "3 cuotas" }]} />
            <Field label="Fecha del anticipo" name="startDate" type="date" defaultValue={toDateInput(todayAR())} required />
          </ActionForm>
        </div>
      )}

      {project.contractType === "SUSCRIPCION" && !hasSub && (
        <div className="max-w-md space-y-2 rounded-md border p-4">
          <h3 className="font-medium">Crear plan de suscripción (6 cuotas)</h3>
          <ActionForm action={createSubscriptionPlan.bind(null, project.id)} submitLabel="Crear plan">
            <Field label="Abono mensual (ARS)" name="monthlyFee" type="number" step="0.01" defaultValue={centsToInput(project.monthlyFeeCents)} required />
            <Field label="Primer pago (ARS)" name="firstPayment" type="number" step="0.01" defaultValue={centsToInput(project.firstPaymentCents)} required />
            <Field label="Vencimiento del primer pago" name="firstDueDate" type="date" defaultValue={toDateInput(todayAR())} required />
          </ActionForm>
        </div>
      )}

      {plans.map((plan) => (
        <div key={plan.id} className="space-y-2">
          <h3 className="text-lg font-medium">{PLAN_LABEL[plan.kind]}</h3>
          <p className="text-sm text-muted-foreground">
            Total {formatARS(plan.summary.totalCents)} · Abonado {formatARS(plan.summary.paidCents)} · Saldo{" "}
            {formatARS(plan.summary.pendingCents)}
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-2">Cuota</th>
                  <th className="p-2">Vence</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2 text-right">Pagado</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {plan.installments.map((i) => (
                  <InstallmentRowView key={i.id} i={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
```

Modificar `src/app/(admin)/projects/[id]/page.tsx`: importar `getProjectBilling` y `BillingSection`, calcular `const plans = await getProjectBilling(id);` y reemplazar el comentario de montaje por:

```tsx
<BillingSection
  project={{
    id: project.id,
    contractType: project.contractType,
    stage: project.stage,
    totalCents: project.totalCents,
    monthlyFeeCents: project.monthlyFeeCents,
    firstPaymentCents: project.firstPaymentCents,
  }}
  plans={plans}
/>
```

- [ ] **Step 5: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm build` — Expected: sin errores.
Manual (`pnpm dev`) con dos proyectos:
1. **Pago Único** $1.000.000 / 3 cuotas / inicio hoy → tabla: Anticipo $500.000 y Cuota 1-3 = $166.666,67 / $166.666,67 / $166.666,66 (suma exacta $1.000.000). Registrar el anticipo completo → estado "Pagado" y aparece el aviso verde "Pasar a En Desarrollo"; pulsarlo cambia la etapa.
2. Intentar pagar $999.999.999 en una cuota → error "El monto supera el saldo de la cuota". Pago parcial de $10.000 en una cuota → sigue "Pendiente", "Pagado" muestra $10.000; "Quitar" lo revierte.
3. **Suscripción** abono $400.000 / primer pago $600.000 → 6 filas: "Primer pago" $600.000 y "Mes 2..6" $400.000. Editar una cuota sin pagos cambia su monto y fecha; una cuota con pagos no ofrece "Editar".
4. Cuota con vencimiento pasado y sin pagar → badge "Vencido".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: plan de cobros, pagos manuales y estados de cuota"
```

---

### Task 12: Ajuste por inflación, extensión de cuotas, mantenimiento y suspensión

**Files:**
- Modify: `src/server/billing/actions.ts`, `src/components/project/billing-section.tsx`, `src/app/(admin)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `repriceInstallments`, `planRecurring`, `needsExtension`, `BATCH_SIZE` (Task 4); `recalcInstallment`, `getProjectBilling` (Task 11).
- Produces: acciones
  - `repricePlan(projectId, kind: "SUSCRIPCION" | "MANTENIMIENTO", prev, fd)` — campos `newFee`, `fromDate`.
  - `extendPlan(planId, prev, fd)` — agrega `BATCH_SIZE` cuotas.
  - `activateMaintenance(projectId, prev, fd)` — campos `fee`, `firstDueDate`.
  - `endMaintenance(projectId, prev, fd)`.
  - `setServiceSuspended(projectId, suspended: boolean, prev, fd)`.
- `BillingProject` gana: `maintenanceActive: boolean`, `maintenanceFeeCents: number | null`, `serviceSuspended: boolean`.

- [ ] **Step 1: Acciones**

Agregar a `src/server/billing/actions.ts` (los imports nuevos se suman a los existentes: `BATCH_SIZE`, `planRecurring`, `repriceInstallments` desde `@/domain/installments`, `todayAR` desde `@/domain/dates`):

```ts
export async function repricePlan(
  projectId: string,
  kind: "SUSCRIPCION" | "MANTENIMIENTO",
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(z.object({ newFee: money("Abono inválido"), fromDate: dateField() }), fd);
  if (!parsed.ok) return fail(parsed.error);
  const plan = await prisma.installmentPlan.findUnique({
    where: { projectId_kind: { projectId, kind } },
    include: { installments: { include: { payments: true } } },
  });
  if (!plan) return fail("No hay plan para ajustar");
  const items = plan.installments.map((i) => ({
    id: i.id,
    type: i.type,
    dueDate: i.dueDate,
    amountCents: decToCents(i.amount),
    paidCents: i.payments.reduce((s, p) => s + decToCents(p.amount), 0),
  }));
  const changes = repriceInstallments(items, parsed.data.fromDate, parsed.data.newFee);
  await prisma.$transaction([
    ...changes.map((c) =>
      prisma.installment.update({ where: { id: c.id }, data: { amount: centsToDec(c.amountCents) } }),
    ),
    prisma.project.update({
      where: { id: projectId },
      data:
        kind === "SUSCRIPCION"
          ? { monthlyFee: centsToDec(parsed.data.newFee) }
          : { maintenanceFee: centsToDec(parsed.data.newFee) },
    }),
  ]);
  refresh(projectId);
  return { message: `Abono actualizado en ${changes.length} cuota(s)` };
}

export async function extendPlan(planId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const plan = await prisma.installmentPlan.findUnique({
    where: { id: planId },
    include: { project: true, installments: { orderBy: { sequence: "asc" } } },
  });
  if (!plan) return fail("Plan no encontrado");
  if (plan.kind === "DESARROLLO") return fail("El plan de desarrollo no se extiende");
  if (plan.kind === "MANTENIMIENTO" && plan.project.maintenanceEndedAt) return fail("El mantenimiento está dado de baja");
  const fee = plan.kind === "SUSCRIPCION" ? plan.project.monthlyFee : plan.project.maintenanceFee;
  if (!fee || plan.installments.length === 0) return fail("Falta el abono vigente");
  const last = plan.installments[plan.installments.length - 1];
  const drafts = planRecurring({
    type: plan.kind === "SUSCRIPCION" ? "MENSUAL" : "MANTENIMIENTO",
    feeCents: decToCents(fee),
    baseDate: plan.installments[0].dueDate,
    startSequence: last.sequence + 1,
    count: BATCH_SIZE,
  });
  await prisma.installment.createMany({ data: drafts.map((d) => ({ planId, ...toCreate(d) })) });
  refresh(plan.projectId);
  return { message: `Se generaron ${BATCH_SIZE} cuotas más` };
}

export async function activateMaintenance(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(z.object({ fee: money("Abono inválido"), firstDueDate: dateField() }), fd);
  if (!parsed.ok) return fail(parsed.error);
  const project = await prisma.project.findUnique({ where: { id: projectId }, include: { plans: true } });
  if (!project) return fail("Proyecto no encontrado");
  if (project.contractType !== "PAGO_UNICO") return fail("El mantenimiento aplica a proyectos de Pago Único");
  if (project.plans.some((p) => p.kind === "MANTENIMIENTO")) return fail("El mantenimiento ya está activo");
  const { fee, firstDueDate } = parsed.data;
  const drafts = planRecurring({
    type: "MANTENIMIENTO",
    feeCents: fee,
    baseDate: firstDueDate,
    startSequence: 1,
    count: BATCH_SIZE,
  });
  await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: {
        maintenanceFee: centsToDec(fee),
        maintenanceStartsAt: firstDueDate,
        maintenanceEndedAt: null,
        stage: "EN_MANTENIMIENTO",
      },
    }),
    prisma.installmentPlan.create({
      data: { projectId, kind: "MANTENIMIENTO", installments: { create: drafts.map(toCreate) } },
    }),
  ]);
  refresh(projectId);
  return { message: "Mantenimiento activado" };
}

export async function endMaintenance(projectId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const plan = await prisma.installmentPlan.findUnique({
    where: { projectId_kind: { projectId, kind: "MANTENIMIENTO" } },
    include: { installments: { include: { payments: true } } },
  });
  if (!plan) return fail("No hay mantenimiento activo");
  const today = todayAR();
  const removable = plan.installments
    .filter((i) => i.dueDate.getTime() >= today.getTime() && i.payments.length === 0)
    .map((i) => i.id);
  await prisma.$transaction([
    prisma.installment.deleteMany({ where: { id: { in: removable } } }),
    prisma.project.update({ where: { id: projectId }, data: { maintenanceEndedAt: today } }),
  ]);
  refresh(projectId);
  return { message: `Mantenimiento dado de baja (${removable.length} cuota(s) futuras anuladas)` };
}

export async function setServiceSuspended(
  projectId: string,
  suspended: boolean,
  _prev: ActionState,
  _fd: FormData,
): Promise<ActionState> {
  await requireAdmin();
  await prisma.project.update({ where: { id: projectId }, data: { serviceSuspended: suspended } });
  refresh(projectId);
  return { message: suspended ? "Servicio suspendido" : "Servicio reactivado" };
}
```

- [ ] **Step 2: UI de ajustes**

En `src/components/project/billing-section.tsx`:

1. Extender `BillingProject` con `maintenanceActive: boolean; maintenanceFeeCents: number | null; serviceSuspended: boolean;` y agregar imports de las acciones nuevas y de `needsExtension`.
2. Dentro del `plans.map(...)`, después de la tabla, para planes `SUSCRIPCION` y `MANTENIMIENTO`:

```tsx
{plan.kind !== "DESARROLLO" && (
  <div className="grid gap-4 md:grid-cols-2">
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Actualizar abono (inflación)</summary>
      <ActionForm
        action={repricePlan.bind(null, project.id, plan.kind)}
        submitLabel="Aplicar nuevo abono"
        className="mt-2 space-y-2"
      >
        <Field label="Nuevo abono (ARS)" name="newFee" type="number" step="0.01" required />
        <Field label="Desde el vencimiento" name="fromDate" type="date" defaultValue={toDateInput(todayAR())} required />
        <p className="text-xs text-muted-foreground">
          Solo cambia cuotas mensuales sin pagos desde esa fecha. El anticipo, el primer pago y lo ya cobrado no se tocan.
        </p>
      </ActionForm>
    </details>
    <div className="rounded-md border p-3 text-sm">
      <p>
        Cuotas pendientes: {plan.installments.filter((i) => i.paidCents < i.amountCents).length}
        {needsExtension(plan.installments.filter((i) => i.paidCents < i.amountCents).length) && (
          <span className="ml-2 text-amber-700">· quedan pocas, generá más</span>
        )}
      </p>
      <ActionForm action={extendPlan.bind(null, plan.id)} submitLabel="Generar 6 cuotas más" variant="outline" className="mt-2" />
    </div>
  </div>
)}
```

3. Al final de la sección agregar (fuera del `plans.map`):

```tsx
{project.contractType === "SUSCRIPCION" && hasSub && (
  <ActionForm
    action={setServiceSuspended.bind(null, project.id, !project.serviceSuspended)}
    submitLabel={project.serviceSuspended ? "Reactivar servicio" : "Suspender servicio"}
    variant="outline"
  />
)}

{project.contractType === "PAGO_UNICO" && !project.maintenanceActive && project.stage === "ENTREGADO" && (
  <div className="max-w-md space-y-2 rounded-md border p-4">
    <h3 className="font-medium">Activar mantenimiento mensual</h3>
    <ActionForm action={activateMaintenance.bind(null, project.id)} submitLabel="Activar mantenimiento">
      <Field label="Abono mensual (ARS)" name="fee" type="number" step="0.01" required />
      <Field label="Primer cobro" name="firstDueDate" type="date" defaultValue={toDateInput(todayAR())} required />
    </ActionForm>
  </div>
)}

{project.maintenanceActive && (
  <ActionForm
    action={endMaintenance.bind(null, project.id)}
    submitLabel="Dar de baja el mantenimiento"
    variant="destructive"
  />
)}
```

4. Importar `repricePlan, extendPlan, activateMaintenance, endMaintenance, setServiceSuspended` desde `@/server/billing/actions` y `needsExtension` desde `@/domain/installments`.

En `src/app/(admin)/projects/[id]/page.tsx` pasar a `BillingSection`:

```tsx
maintenanceActive: plans.some((p) => p.kind === "MANTENIMIENTO") && !project.maintenanceEndedAt,
maintenanceFeeCents: project.maintenanceFeeCents,
serviceSuspended: project.serviceSuspended,
```

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm build` — Expected: sin errores.
Manual:
1. Suscripción con 6 cuotas: registrar pago del "Primer pago" y un pago parcial en "Mes 2". Actualizar abono a $450.000 desde el vencimiento de "Mes 2" → mensaje "Abono actualizado en N cuota(s)"; "Primer pago" y "Mes 2" (con pago parcial) **no cambian**; "Mes 3..6" pasan a $450.000.
2. "Generar 6 cuotas más" → ahora 12 filas; las nuevas con el abono vigente ($450.000) y fechas consecutivas.
3. Suspender servicio → el proyecto queda marcado (verificar `serviceSuspended=true` en Prisma Studio; el estado visible se muestra en Task 14).
4. Proyecto Pago Único → etapa "Entregado" → aparece "Activar mantenimiento"; activarlo ($80.000) → etapa "En Mantenimiento", nuevo plan "Mantenimiento" con 6 cuotas. "Dar de baja" anula las futuras sin pagos y conserva las pagadas.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: ajuste por inflación, extensión de cuotas y mantenimiento"
```

---

### Task 13: Infraestructura (dominios, hosting, servidores)

**Files:**
- Create: `src/server/infrastructure/queries.ts`, `src/server/infrastructure/actions.ts`, `src/components/project/infra-section.tsx`, `src/app/(admin)/infrastructure/page.tsx`
- Modify: `src/app/(admin)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `parseForm`, `text`, `dateField`, `optMoney`, `fail`, `ActionForm`, `Field`, `SelectField`; `renewalAlerts` (Task 5).
- Produces: `listAssets()`; `createAsset(projectId, prev, fd)`, `deleteAsset(id, prev, fd)`; `<InfraSection projectId assets>`.

- [ ] **Step 1: Consultas y acciones**

`src/server/infrastructure/queries.ts`:

```ts
import "server-only";
import { prisma } from "@/lib/prisma";

export const listAssets = () =>
  prisma.infrastructureAsset.findMany({
    orderBy: { renewalDate: "asc" },
    include: { project: { select: { id: true, name: true, client: { select: { name: true } } } } },
  });
```

`src/server/infrastructure/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { dateField, fail, optMoney, parseForm, text, type ActionState } from "@/lib/form";
import { centsToDec } from "@/server/mappers";

const schema = z.object({
  type: z.enum(["DOMINIO", "HOSTING", "SERVIDOR"]),
  provider: text("El proveedor es obligatorio"),
  identifier: text("El identificador es obligatorio (ej. dominio.com)"),
  renewalDate: dateField("Fecha de renovación inválida"),
  managedByNaro: z.enum(["true", "false"]),
  cost: optMoney,
});

export async function createAsset(projectId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = parseForm(schema, fd);
  if (!parsed.ok) return fail(parsed.error);
  const { managedByNaro, cost, ...rest } = parsed.data;
  await prisma.infrastructureAsset.create({
    data: {
      ...rest,
      projectId,
      managedByNaro: managedByNaro === "true",
      costAmount: cost ? centsToDec(cost) : undefined,
    },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/infrastructure");
  revalidatePath("/dashboard");
  return { message: "Activo agregado" };
}

export async function deleteAsset(id: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const asset = await prisma.infrastructureAsset.delete({ where: { id } });
  revalidatePath(`/projects/${asset.projectId}`);
  revalidatePath("/infrastructure");
  revalidatePath("/dashboard");
  return { message: "Activo eliminado" };
}
```

- [ ] **Step 2: Sección del proyecto y página global**

`src/components/project/infra-section.tsx`:

```tsx
import { ActionForm } from "@/components/action-form";
import { Field, SelectField } from "@/components/fields";
import { formatDate } from "@/domain/dates";
import { ASSET_LABEL } from "@/lib/labels";
import { createAsset, deleteAsset } from "@/server/infrastructure/actions";

export function InfraSection({
  projectId,
  assets,
}: {
  projectId: string;
  assets: { id: string; type: keyof typeof ASSET_LABEL; provider: string; identifier: string; renewalDate: Date; managedByNaro: boolean }[];
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Infraestructura</h2>
      <ul className="divide-y rounded-md border">
        {assets.length === 0 && <li className="p-3 text-sm text-muted-foreground">Sin dominios ni hosting cargados.</li>}
        {assets.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span>
              {ASSET_LABEL[a.type]} · {a.identifier} · {a.provider} · {a.managedByNaro ? "Gestiona Naro" : "Gestiona el cliente"}
            </span>
            <span className="flex items-center gap-3">
              Renueva {formatDate(a.renewalDate)}
              <ActionForm action={deleteAsset.bind(null, a.id)} submitLabel="Quitar" variant="outline" className="" />
            </span>
          </li>
        ))}
      </ul>
      <details className="max-w-md">
        <summary className="cursor-pointer text-sm underline">Agregar dominio / hosting / servidor</summary>
        <ActionForm action={createAsset.bind(null, projectId)} submitLabel="Agregar" className="mt-2 space-y-2">
          <SelectField label="Tipo" name="type" options={Object.entries(ASSET_LABEL).map(([value, label]) => ({ value, label }))} />
          <Field label="Proveedor" name="provider" required />
          <Field label="Identificador (dominio, plan…)" name="identifier" required />
          <Field label="Renovación" name="renewalDate" type="date" required />
          <SelectField
            label="Lo gestiona"
            name="managedByNaro"
            options={[{ value: "true", label: "Grupo Naro" }, { value: "false", label: "Cliente" }]}
          />
          <Field label="Costo (ARS, opcional)" name="cost" type="number" step="0.01" />
        </ActionForm>
      </details>
    </section>
  );
}
```

`src/app/(admin)/infrastructure/page.tsx`:

```tsx
import Link from "next/link";
import { formatDate, todayAR } from "@/domain/dates";
import { renewalAlerts } from "@/domain/metrics";
import { ASSET_LABEL } from "@/lib/labels";
import { listAssets } from "@/server/infrastructure/queries";

export default async function InfrastructurePage() {
  const assets = await listAssets();
  const today = todayAR();
  const { expired } = renewalAlerts(assets, today, 30);
  const expiredIds = new Set(expired.map((a) => a.id));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Infraestructura</h1>
      <p className="text-sm text-muted-foreground">Los activos se agregan desde la ficha de cada proyecto.</p>
      <ul className="divide-y rounded-md border">
        {assets.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin activos.</li>}
        {assets.map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
            <span>
              {ASSET_LABEL[a.type]} · {a.identifier} ·{" "}
              <Link className="underline" href={`/projects/${a.project.id}`}>
                {a.project.name} ({a.project.client.name})
              </Link>{" "}
              · {a.managedByNaro ? "Gestiona Naro" : "Gestiona el cliente"}
            </span>
            <span className={expiredIds.has(a.id) ? "font-medium text-red-600" : ""}>Renueva {formatDate(a.renewalDate)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

En `projects/[id]/page.tsx` montar `<InfraSection projectId={project.id} assets={project.assets} />` debajo de `BillingSection`.

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm build` — Expected: sin errores.
Manual: agregar un dominio `acme.com` (Nic.ar, renueva en 20 días, gestiona Naro) y un hosting; aparecen en la ficha y en `/infrastructure`; uno con fecha pasada se muestra en rojo; "Quitar" lo elimina.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: activos de infraestructura con fechas de renovación"
```

---

### Task 14: Dashboard

**Files:**
- Create: `src/server/dashboard/queries.ts`
- Modify: `src/app/(admin)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `mrrCents`, `realVsProjected`, `installmentAlerts`, `renewalAlerts` (Task 5); `serviceStatus` (Task 5); `todayAR`, `addMonths` (Task 3); `installmentLabel` (Task 6).
- Produces: `getDashboard(now?: Date)` → `{ today, mrr, months: { label; realCents; projectedCents }[], overdue, upcoming, renewals: { expired, upcoming } }`.

- [ ] **Step 1: Consulta del dashboard**

`src/server/dashboard/queries.ts`:

```ts
import "server-only";
import { addMonths, todayAR } from "@/domain/dates";
import { installmentLabel } from "@/domain/labels";
import { installmentAlerts, mrrCents, realVsProjected, renewalAlerts } from "@/domain/metrics";
import { serviceStatus } from "@/domain/status";
import { prisma } from "@/lib/prisma";
import { decToCents } from "@/server/mappers";

export async function getDashboard(now = new Date()) {
  const today = todayAR(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [installments, assets, projects] = await Promise.all([
    prisma.installment.findMany({
      include: {
        payments: true,
        plan: { select: { kind: true, project: { select: { id: true, name: true, client: { select: { name: true } } } } } },
      },
    }),
    prisma.infrastructureAsset.findMany({
      where: { managedByNaro: true },
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { OR: [{ contractType: "SUSCRIPCION" }, { maintenanceFee: { not: null } }] },
      include: { plans: { include: { installments: { include: { payments: true } } } } },
    }),
  ]);

  const rows = installments.map((i) => {
    const paidCents = i.payments.reduce((s, p) => s + decToCents(p.amount), 0);
    return {
      id: i.id,
      projectId: i.plan.project.id,
      label: `${i.plan.project.name} (${i.plan.project.client.name}) — ${installmentLabel(i.type, i.sequence)}`,
      amountCents: decToCents(i.amount),
      paidCents,
      dueDate: i.dueDate,
      payments: i.payments.map((p) => ({ amountCents: decToCents(p.amount), paidAt: p.paidAt })),
    };
  });

  const allPayments = rows.flatMap((r) => r.payments);
  const months = Array.from({ length: 4 }, (_, k) => {
    const from = addMonths(monthStart, k);
    const to = addMonths(monthStart, k + 1);
    const { realCents, projectedCents } = realVsProjected({ payments: allPayments, installments: rows }, from, to);
    return {
      label: new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(from),
      realCents,
      projectedCents,
    };
  });

  const mrr = mrrCents(
    projects.flatMap((p) => {
      const out: { kind: "SUSCRIPCION" | "MANTENIMIENTO"; feeCents: number; active: boolean }[] = [];
      const subPlan = p.plans.find((pl) => pl.kind === "SUSCRIPCION");
      if (subPlan && p.monthlyFee) {
        const status = serviceStatus(
          {
            suspended: p.serviceSuspended,
            installments: subPlan.installments.map((i) => ({
              amountCents: decToCents(i.amount),
              paidCents: i.payments.reduce((s, x) => s + decToCents(x.amount), 0),
              dueDate: i.dueDate,
            })),
          },
          today,
        );
        out.push({ kind: "SUSCRIPCION", feeCents: decToCents(p.monthlyFee), active: status === "ACTIVO" });
      }
      const hasMaint = p.plans.some((pl) => pl.kind === "MANTENIMIENTO");
      if (hasMaint && p.maintenanceFee) {
        out.push({ kind: "MANTENIMIENTO", feeCents: decToCents(p.maintenanceFee), active: !p.maintenanceEndedAt });
      }
      return out;
    }),
  );

  const { overdue, upcoming } = installmentAlerts(rows, today, 7);
  const renewals = renewalAlerts(
    assets.map((a) => ({ id: a.id, projectId: a.project.id, label: `${a.identifier} — ${a.project.name}`, renewalDate: a.renewalDate })),
    today,
    30,
  );

  return { today, mrr, months, overdue, upcoming, renewals };
}
```

- [ ] **Step 2: Página**

`src/app/(admin)/dashboard/page.tsx`:

```tsx
import Link from "next/link";
import { formatDate } from "@/domain/dates";
import { formatARS } from "@/domain/money";
import { getDashboard } from "@/server/dashboard/queries";

function AlertList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "red" | "amber";
  items: { id: string; label: string; date: Date; amount?: number; href: string }[];
}) {
  return (
    <div className="rounded-md border p-4">
      <h3 className={`mb-2 font-medium ${tone === "red" ? "text-red-700" : "text-amber-700"}`}>
        {title} ({items.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {items.length === 0 && <li className="text-muted-foreground">Nada por ahora.</li>}
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            <Link href={i.href} className="underline">{i.label}</Link>
            <span>
              {formatDate(i.date)}
              {i.amount !== undefined ? ` · ${formatARS(i.amount)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function DashboardPage() {
  const d = await getDashboard();
  const cuota = (x: (typeof d.overdue)[number]) => ({
    id: x.id, label: x.label, date: x.dueDate, amount: x.amountCents - x.paidCents, href: `/projects/${x.projectId}`,
  });
  const renewal = (x: (typeof d.renewals.expired)[number]) => ({
    id: x.id, label: x.label, date: x.renewalDate, href: `/projects/${x.projectId}`,
  });
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">MRR total</p>
          <p className="text-2xl font-semibold">{formatARS(d.mrr.totalCents)}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Suscripciones activas</p>
          <p className="text-xl font-semibold">{formatARS(d.mrr.subscriptionCents)}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-sm text-muted-foreground">Mantenimientos activos</p>
          <p className="text-xl font-semibold">{formatARS(d.mrr.maintenanceCents)}</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Ingresos reales vs. proyectados</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr><th className="p-2">Mes</th><th className="p-2 text-right">Real (cobrado)</th><th className="p-2 text-right">Proyectado (vence)</th></tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.label} className="border-t">
                  <td className="p-2 capitalize">{m.label}</td>
                  <td className="p-2 text-right">{formatARS(m.realCents)}</td>
                  <td className="p-2 text-right">{formatARS(m.projectedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <AlertList title="Cuotas vencidas" tone="red" items={d.overdue.map(cuota)} />
        <AlertList title="Cuotas por vencer (7 días)" tone="amber" items={d.upcoming.map(cuota)} />
        <AlertList title="Renovaciones vencidas" tone="red" items={d.renewals.expired.map(renewal)} />
        <AlertList title="Renovaciones próximas (30 días)" tone="amber" items={d.renewals.upcoming.map(renewal)} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

Run: `pnpm typecheck && pnpm lint && pnpm build` — Expected: sin errores.
Manual con los datos de las tareas anteriores: MRR = abono de las suscripciones activas + mantenimientos activos; una suscripción **suspendida** o con cuota vencida impaga **no suma**. "Real" del mes actual coincide con los pagos de este mes; "Proyectado" suma las cuotas que vencen ese mes. Una cuota vencida aparece en rojo; un dominio por renovar en 30 días aparece en "Renovaciones próximas"; uno `managedByNaro = false` no aparece.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: dashboard con MRR, real vs proyectado y alertas"
```

---

### Task 15: Portal del cliente (token, enlace y vista pública)

**Files:**
- Create: `src/lib/tokens.ts`, `src/lib/rate-limit.ts`, `src/server/portal/queries.ts`, `src/server/portal/actions.ts`, `src/components/project/portal-section.tsx`, `src/app/client/view/[token]/page.tsx`
- Test: `src/lib/tokens.test.ts`, `src/lib/rate-limit.test.ts`
- Modify: `src/app/(admin)/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `buildPortalView`, `PortalInput`, `PortalView` (Task 6); `todayAR`, `formatDate`, `formatARS`; `getProjectBilling`-style mapping (aquí consulta propia con DTO).
- Produces:

```ts
generateToken(): string                       // 43 chars base64url (32 bytes)
hashToken(token: string): string              // sha256 hex
isWellFormedToken(token: string): boolean
evaluateToken(row: { expiresAt: Date | null; revokedAt: Date | null } | null, now: Date): "OK" | "INVALID"
createRateLimiter(o: { limit: number; windowMs: number }): (key: string, now?: number) => boolean
getPortalViewByToken(rawToken: string): Promise<PortalView | null>
generatePortalToken(projectId, prev, fd), revokePortalToken(tokenId, prev, fd)
```

- [ ] **Step 1: Tests que fallan**

`src/lib/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateToken, generateToken, hashToken, isWellFormedToken } from "./tokens";

describe("tokens", () => {
  it("genera tokens únicos de 43 caracteres base64url", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(isWellFormedToken(a)).toBe(true);
  });

  it("hashToken es determinístico y hex de 64 caracteres", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("rechaza tokens malformados sin consultar la base", () => {
    expect(isWellFormedToken("")).toBe(false);
    expect(isWellFormedToken("corto")).toBe(false);
    expect(isWellFormedToken(" ".repeat(43))).toBe(false);
    expect(isWellFormedToken("a".repeat(44))).toBe(false);
    expect(isWellFormedToken("../".repeat(15))).toBe(false);
  });

  it("evaluateToken: inexistente, revocado y vencido son INVALID", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(evaluateToken(null, now)).toBe("INVALID");
    expect(evaluateToken({ expiresAt: null, revokedAt: new Date("2026-10-01") }, now)).toBe("INVALID");
    expect(evaluateToken({ expiresAt: new Date("2026-10-13T12:00:00Z"), revokedAt: null }, now)).toBe("INVALID");
    expect(evaluateToken({ expiresAt: new Date("2026-10-14"), revokedAt: null }, now)).toBe("OK");
    expect(evaluateToken({ expiresAt: null, revokedAt: null }, now)).toBe("OK");
  });
});
```

`src/lib/rate-limit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("rate limiter", () => {
  it("permite hasta el límite dentro de la ventana y luego bloquea", () => {
    const allow = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([allow("ip", 0), allow("ip", 100), allow("ip", 200)]).toEqual([true, true, true]);
    expect(allow("ip", 300)).toBe(false);
  });

  it("libera cuando pasa la ventana y separa por clave", () => {
    const allow = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(allow("a", 0)).toBe(true);
    expect(allow("b", 0)).toBe(true);
    expect(allow("a", 500)).toBe(false);
    expect(allow("a", 1001)).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `pnpm test src/lib` — Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar utilidades**

`src/lib/tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

export const generateToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const isWellFormedToken = (token: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(token);

export function evaluateToken(
  row: { expiresAt: Date | null; revokedAt: Date | null } | null,
  now: Date,
): "OK" | "INVALID" {
  if (!row || row.revokedAt) return "INVALID";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "INVALID";
  return "OK";
}
```

`src/lib/rate-limit.ts`:

```ts
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number = Date.now()): boolean => {
    if (hits.size > 10_000) hits.clear();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
```

Run: `pnpm test` — Expected: PASS.

- [ ] **Step 4: Consulta pública y acciones del administrador**

`src/server/portal/queries.ts`:

```ts
import "server-only";
import { todayAR } from "@/domain/dates";
import { buildPortalView, type PortalView } from "@/domain/portal";
import { prisma } from "@/lib/prisma";
import { evaluateToken, hashToken, isWellFormedToken } from "@/lib/tokens";
import { decToCents } from "@/server/mappers";

export async function getPortalViewByToken(rawToken: string): Promise<PortalView | null> {
  if (!isWellFormedToken(rawToken)) return null;
  const row = await prisma.clientAccessToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      project: {
        include: {
          client: { select: { name: true } },
          plans: {
            orderBy: { createdAt: "asc" },
            include: {
              installments: { orderBy: { sequence: "asc" }, include: { payments: { orderBy: { paidAt: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!row || evaluateToken(row, new Date()) !== "OK") return null;
  await prisma.clientAccessToken.update({ where: { id: row.id }, data: { lastViewedAt: new Date() } });

  const { project } = row;
  return buildPortalView(
    {
      projectName: project.name,
      clientName: project.client.name,
      stage: project.stage,
      plans: project.plans.map((plan) => ({
        kind: plan.kind,
        installments: plan.installments.map((i) => {
          const payments = i.payments.map((p) => ({ amountCents: decToCents(p.amount), paidAt: p.paidAt }));
          return {
            type: i.type,
            sequence: i.sequence,
            amountCents: decToCents(i.amount),
            dueDate: i.dueDate,
            paidCents: payments.reduce((s, p) => s + p.amountCents, 0),
            payments,
          };
        }),
      })),
    },
    todayAR(),
  );
}
```

`src/server/portal/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { fail, type ActionState } from "@/lib/form";
import { generateToken, hashToken } from "@/lib/tokens";

export async function generatePortalToken(projectId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return fail("Proyecto no encontrado");
  const token = generateToken();
  await prisma.$transaction([
    prisma.clientAccessToken.updateMany({ where: { projectId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.clientAccessToken.create({ data: { projectId, tokenHash: hashToken(token) } }),
  ]);
  revalidatePath(`/projects/${projectId}`);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return { message: `Copiá el enlace ahora, no se vuelve a mostrar: ${base}/client/view/${token}` };
}

export async function revokePortalToken(tokenId: string, _prev: ActionState, _fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const token = await prisma.clientAccessToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
  revalidatePath(`/projects/${token.projectId}`);
  return { message: "Enlace revocado" };
}
```

- [ ] **Step 5: Sección del proyecto y página pública**

`src/components/project/portal-section.tsx`:

```tsx
import { ActionForm } from "@/components/action-form";
import { formatDate } from "@/domain/dates";
import { generatePortalToken, revokePortalToken } from "@/server/portal/actions";

export function PortalSection({
  projectId,
  tokens,
}: {
  projectId: string;
  tokens: { id: string; createdAt: Date; lastViewedAt: Date | null }[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Enlace para el cliente</h2>
      {tokens.length === 0 && <p className="text-sm text-muted-foreground">No hay un enlace activo.</p>}
      {tokens.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <span>
            Activo desde {formatDate(t.createdAt)} · {t.lastViewedAt ? `visto por última vez ${formatDate(t.lastViewedAt)}` : "nunca visto"}
          </span>
          <ActionForm action={revokePortalToken.bind(null, t.id)} submitLabel="Revocar" variant="outline" className="" />
        </div>
      ))}
      <ActionForm
        action={generatePortalToken.bind(null, projectId)}
        submitLabel={tokens.length ? "Regenerar enlace (revoca el anterior)" : "Generar enlace"}
      />
    </section>
  );
}
```

`src/app/client/view/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { formatDate } from "@/domain/dates";
import { formatARS } from "@/domain/money";
import { createRateLimiter } from "@/lib/rate-limit";
import { PLAN_LABEL, STAGE_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/labels";
import { getPortalViewByToken } from "@/server/portal/queries";

export const instant = false;
export const metadata: Metadata = {
  title: "Estado de tu proyecto",
  robots: { index: false, follow: false },
};

const allow = createRateLimiter({ limit: 30, windowMs: 60_000 });

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(ip)) notFound();

  const view = await getPortalViewByToken(token);
  if (!view) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
      <header>
        <p className="text-sm text-muted-foreground">{view.clientName}</p>
        <h1 className="text-2xl font-semibold">{view.projectName}</h1>
        <p className="mt-1 text-sm">
          Estado del proyecto: <strong>{STAGE_LABEL[view.stage as keyof typeof STAGE_LABEL] ?? view.stage}</strong>
        </p>
      </header>

      {view.plans.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay un plan de pagos cargado.</p>}

      {view.plans.map((plan) => (
        <section key={plan.kind} className="space-y-4">
          <h2 className="text-lg font-semibold">{PLAN_LABEL[plan.kind]}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Total abonado</p><p className="font-semibold">{formatARS(plan.paidCents)}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Saldo pendiente</p><p className="font-semibold">{formatARS(plan.pendingCents)}</p></div>
            <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{formatARS(plan.totalCents)}</p></div>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium">Cuotas pendientes</h3>
            <ul className="divide-y rounded-md border text-sm">
              {plan.pending.length === 0 && <li className="p-3 text-muted-foreground">No hay cuotas pendientes.</li>}
              {plan.pending.map((p, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span>{p.label} · vence {formatDate(p.dueDate)}</span>
                  <span className="flex items-center gap-2">
                    {formatARS(p.remainingCents)}
                    <span className={`rounded px-2 py-0.5 text-xs ${STATUS_CLASS[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium">Historial de pagos</h3>
            <ul className="divide-y rounded-md border text-sm">
              {plan.payments.length === 0 && <li className="p-3 text-muted-foreground">Todavía no hay pagos registrados.</li>}
              {plan.payments.map((p, i) => (
                <li key={i} className="flex justify-between gap-2 p-3">
                  <span>{formatDate(p.paidAt)} · {p.label}</span>
                  <span>{formatARS(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </main>
  );
}
```

En `projects/[id]/page.tsx` montar `<PortalSection projectId={project.id} tokens={project.tokens} />` al final.

- [ ] **Step 6: Verificar**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build` — Expected: todos pasan.
Manual:
1. En un proyecto con pagos, "Generar enlace" muestra la URL una sola vez. Abrirla en una ventana privada (sin sesión): se ve etapa, totales, saldo, cuotas pendientes con estado y vencimientos, e historial. **No** aparecen notas de comprobante ni de cliente.
2. En Prisma Studio, `ClientAccessToken.tokenHash` es un hash (no el token) y `lastViewedAt` se actualiza.
3. "Regenerar" → la URL vieja da 404; "Revocar" → la URL da 404.
4. `/client/view/basura` y un token de 43 caracteres inventado dan la misma página 404.
5. La respuesta HTML contiene `<meta name="robots" content="noindex, nofollow">`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: portal del cliente por token seguro"
```

---

### Task 16: Despliegue en el VPS con Cloudflare Tunnel y respaldos

**Files:**
- Create: `deploy/ecosystem.config.cjs`, `deploy/cloudflared-config.example.yml`, `deploy/backup.ps1`, `deploy/backup.sh`, `deploy/README.md`

**Interfaces:**
- Consumes: build standalone (Task 1), variables de entorno (Task 1), migraciones (Task 2).
- Produces: procedimiento reproducible de build, arranque, exposición y respaldo.

> El sistema operativo del VPS no está definido: la guía cubre Windows (Programador de tareas) y Linux (cron). pm2 y cloudflared funcionan en ambos.

- [ ] **Step 1: Proceso gestionado con pm2**

`deploy/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: "grupo-naro",
      cwd: __dirname + "/../.next/standalone",
      script: "server.js",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
```

El servidor standalone no copia `public/` ni `.next/static/`; el script de build los copia (ver Step 4). Las variables sensibles (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`, `APP_URL`) se definen en el entorno del servicio o en un `.env` junto a `server.js`.

- [ ] **Step 2: Cloudflare Tunnel**

`deploy/cloudflared-config.example.yml`:

```yaml
tunnel: <ID-DEL-TUNEL>
credentials-file: <RUTA>/<ID-DEL-TUNEL>.json
ingress:
  - hostname: panel.tudominio.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

- [ ] **Step 3: Respaldos de PostgreSQL**

`deploy/backup.ps1` (Windows):

```powershell
$ErrorActionPreference = "Stop"
$dir = "D:\backups\grupo-naro"
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir ("grupo_naro_{0:yyyyMMdd_HHmm}.dump" -f (Get-Date))
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -U postgres -h localhost -Fc -f $file grupo_naro
Get-ChildItem $dir -Filter *.dump | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
```

`deploy/backup.sh` (Linux):

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="${BACKUP_DIR:-/var/backups/grupo-naro}"
mkdir -p "$DIR"
pg_dump -U postgres -h localhost -Fc -f "$DIR/grupo_naro_$(date +%Y%m%d_%H%M).dump" grupo_naro
find "$DIR" -name '*.dump' -mtime +30 -delete
```

(La contraseña de `pg_dump` se provee con `PGPASSWORD` o un archivo `pgpass`; no se escribe en el script.)

- [ ] **Step 4: Guía de despliegue**

`deploy/README.md` debe contener, con estos comandos exactos:

```bash
# 1. Build (en el servidor)
pnpm install --frozen-lockfile
pnpm exec prisma migrate deploy        # aplica migraciones, nunca "migrate dev" en producción
pnpm db:seed                           # solo la primera vez
pnpm build
cp -r public .next/standalone/public
cp -r .next/static .next/standalone/.next/static

# 2. Arranque persistente
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save                               # + pm2-windows-startup / "pm2 startup" en Linux

# 3. Túnel
cloudflared tunnel login
cloudflared tunnel create grupo-naro
cloudflared tunnel route dns grupo-naro panel.tudominio.com
cloudflared service install            # corre el túnel como servicio
```

Y las variables de producción: `AUTH_URL=https://panel.tudominio.com`, `APP_URL=https://panel.tudominio.com`, `AUTH_TRUST_HOST=true`, `AUTH_SECRET` nuevo (distinto al de desarrollo), `DATABASE_URL` apuntando a `localhost`. Incluir las instrucciones para programar el respaldo diario (Programador de tareas ejecutando `deploy/backup.ps1`, o `0 3 * * * /ruta/deploy/backup.sh` en cron) y el procedimiento de restauración (`pg_restore -U postgres -h localhost -d grupo_naro --clean <archivo>.dump`).

- [ ] **Step 5: Verificación de punta a punta**

Run local: `pnpm build` y luego `node .next/standalone/server.js` (con `PORT=3000`, `HOSTNAME=127.0.0.1` y las variables cargadas) — Expected: el sitio responde en `http://127.0.0.1:3000`.
Con el túnel activo, desde otra red (datos móviles):
1. `https://panel.tudominio.com/dashboard` → redirige a `/login`; el login funciona y la cookie de sesión es `Secure`.
2. Un enlace de portal generado en producción abre sin login desde el celular del cliente.
3. El puerto 5432 **no** es accesible desde fuera (`Test-NetConnection <ip-publica> -Port 5432` falla).
4. Ejecutar el script de respaldo y confirmar que genera un `.dump` no vacío; probar `pg_restore --list <archivo>`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: despliegue con pm2, Cloudflare Tunnel y respaldos"
```

---

## Self-review (cobertura de la spec)

| Requisito de la spec | Tarea |
|---|---|
| §2 stack, Postgres local, Prisma, Auth.js | 1, 2, 7 |
| §4 Pago Único (50% + 2/3 cuotas, redondeo) | 4, 11 |
| §4 Suscripción (montos manuales, 6 cuotas, ajuste por inflación, `VENCIDA`/`SUSPENDIDO`) | 4, 5, 11, 12 |
| §4 Mantenimiento en Pago Único (opcional, plan separado, baja) | 12 |
| §4 Cobros manuales, pagos parciales, `VENCIDO` derivado, saldo | 5, 11 |
| §4 MRR y real vs proyectado | 5, 14 |
| §5 Modelo de datos (9 entidades) | 2 |
| §6 Portal por token (DTO, hash, revocable, noindex, 404, límite de intentos) | 6, 15 |
| §7 Dashboard y alertas (cuotas 7 días, renovaciones 30 días) | 5, 13, 14 |
| §8 Seguridad (proxy, revalidar sesión en cada acción) y despliegue | 7 (`requireAdmin` en cada acción), 16 |
| §9 Pruebas de dominio con Vitest | 3, 4, 5, 6, 15 |
| Clientes, propuestas con ambas opciones y aceptación | 8, 9 |
| Pipeline de etapas | 9, 10 |
| Ficha con infraestructura y propiedad del código | 10, 13 |

Desviación consciente respecto de la spec: `Project.serviceStatus` se deriva y solo se guarda `serviceSuspended` (documentado en Task 2 y reflejado en la spec).

Consistencia de nombres revisada: `planOneTime / planRecurring / planSubscription / repriceInstallments / needsExtension` (Task 4) → usados igual en Tasks 11 y 12; `installmentStatus / summarize / remainingCents / assertPayable / serviceStatus` (Task 5) → Tasks 11 y 14; `decToCents / centsToDec` (Task 2) en todas las capas de servidor; `ActionState / fail / parseForm` (Task 7) en todas las acciones; acciones con `bind` reciben `(prev, fd)` al final.

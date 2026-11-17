import { z } from "zod";

export const meterIdSchema = z.string().regex(/^[A-Za-z0-9_-]{3,40}$/, "invalid meter id");

export const rangeQuery = z.object({
  meterId: meterIdSchema.optional(),
  range: z.enum(["daily", "weekly", "monthly"]).default("daily"),
});
export const meterQuery = z.object({ meterId: meterIdSchema.optional() });
export const forecastQuery = z.object({
  meterId: meterIdSchema.optional(),
  horizon: z.coerce.number().int().min(1).max(24).default(24),
});
export const historyQuery = z.object({
  meterId: meterIdSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const tariffSchema = z
  .object({
    offPeakRate: z.number().positive().max(100),
    peakRate: z.number().positive().max(100),
    peakStartHour: z.number().int().min(0).max(23),
    peakEndHour: z.number().int().min(0).max(23),
    fixedMonthlyCharge: z.number().min(0).max(100000),
  })
  .refine((t) => t.peakRate >= t.offPeakRate, { message: "peakRate must be >= offPeakRate", path: ["peakRate"] })
  .refine((t) => t.peakStartHour !== t.peakEndHour, { message: "peak window cannot be empty", path: ["peakEndHour"] });
export const tariffPut = z.object({ meterId: meterIdSchema.optional(), tariff: tariffSchema });

export const ingestSchema = z.object({
  meterId: meterIdSchema,
  readings: z
    .array(
      z.object({
        ts: z.string().datetime({ offset: true }),
        powerKw: z.number().min(0).max(100),
        voltageV: z.number().min(0).max(500).optional(),
        currentA: z.number().min(0).max(1000).optional(),
      })
    )
    .min(1)
    .max(500),
});

export function parse(schema, data) {
  const res = schema.safeParse(data);
  if (!res.success) {
    const msg = res.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    throw new HttpError(400, msg);
  }
  return res.data;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

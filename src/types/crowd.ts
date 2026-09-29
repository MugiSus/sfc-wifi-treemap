import { z } from 'zod';

export const crowdAreasSchema = z.object({
  areas: z.array(
    z.object({
      areaKey: z.string().min(1),
      buildingKey: z.string().min(1),
      floor: z.string().min(1).optional(),
    }),
  ),
});

const clientCountSchema = z.number().int().nonnegative().nullable();

export const crowdSnapshotSchema = z.object({
  type: z.literal('building-crowd-snapshot'),
  generatedAt: z.iso.datetime({ offset: true }),
  measuredAt: z.iso.datetime({ offset: true }).nullable(),
  latestRawAt: z.iso.datetime({ offset: true }).nullable(),
  processingPending: z.boolean(),
  readings: z.array(
    z.object({
      areaKey: z.string().min(1),
      buildingKey: z.string().min(1),
      areaKeys: z.array(z.string().min(1)),
      totalClientCount: clientCountSchema,
      excludedClientCount: clientCountSchema,
      clientCount: clientCountSchema,
    }),
  ),
});

export type CrowdSnapshot = z.infer<typeof crowdSnapshotSchema>;

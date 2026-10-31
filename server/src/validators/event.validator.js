import { z } from 'zod';
import { objectId, trimmed, optionalText, stringArray, optionalInt } from './common.js';

export const paginationQuery = {
  cursor: objectId.optional(),
  limit: optionalInt(1, 50),
};

export const createEventSchema = z
  .object({
    title: trimmed(3, 140, 'Event title'),
    description: optionalText(4000),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional().nullable(),
    location: optionalText(160),
    isOnline: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    meetingLink: optionalText(2000),
    group: objectId.optional().nullable(),
    college: optionalText(100),
    capacity: optionalInt(1, 100000),
    tags: stringArray(10, 30).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.endsAt && data.startsAt >= data.endsAt) {
        return false;
      }
      return true;
    },
    { message: 'Event must end after it starts', path: ['endsAt'] }
  )
  .refine(
    (data) => {
      if (data.isOnline && !data.meetingLink) {
        return false;
      }
      return true;
    },
    { message: 'Meeting link is required for online events', path: ['meetingLink'] }
  );

export const updateEventSchema = z
  .object({
    title: trimmed(3, 140, 'Event title').optional(),
    description: optionalText(4000),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional().nullable(),
    location: optionalText(160),
    isOnline: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    meetingLink: optionalText(2000),
    group: objectId.optional().nullable(),
    college: optionalText(100),
    capacity: optionalInt(1, 100000),
    tags: stringArray(10, 30).optional(),
  })
  .strict()
  .refine(
    (data) => {
      // If both are provided, validate them
      if (data.startsAt && data.endsAt && data.startsAt >= data.endsAt) {
        return false;
      }
      return true;
    },
    { message: 'Event must end after it starts', path: ['endsAt'] }
  );

export const listEventsQuerySchema = z.object({
  search: optionalText(60),
  tags: stringArray(5, 30).optional(),
  group: objectId.optional(),
  college: optionalText(100),
  type: z.enum(['upcoming', 'past']).optional(),
  ...paginationQuery,
});

export const idParamSchema = z.object({ id: objectId }).strict();

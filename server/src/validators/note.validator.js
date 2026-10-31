import { z } from 'zod';
import { objectId, optionalText, optionalInt, stringArray, trimmed } from './common.js';
import { paginationQuery } from './post.validator.js';

export const createNoteSchema = z
  .object({
    title: trimmed(3, 140, 'Title'),
    description: optionalText(2000),
    subject: trimmed(1, 80, 'Subject'),
    course: optionalText(100),
    branch: optionalText(100),
    semester: optionalInt(1, 10),
    year: optionalInt(1, 6),
    tags: stringArray(10, 30),
    group: objectId.optional().nullable(),
  })
  .strict();

export const updateNoteSchema = z
  .object({
    title: trimmed(3, 140, 'Title').optional(),
    description: optionalText(2000),
    subject: trimmed(1, 80, 'Subject').optional(),
    course: optionalText(100),
    branch: optionalText(100),
    semester: optionalInt(1, 10),
    year: optionalInt(1, 6),
    tags: stringArray(10, 30).optional(),
  })
  .strict();

export const listNotesQuerySchema = z.object({
  search: optionalText(140),
  subject: optionalText(80),
  course: optionalText(100),
  semester: optionalInt(1, 10),
  uploadedBy: objectId.optional(),
  ...paginationQuery,
});

export const idParamSchema = z.object({ id: objectId }).strict();

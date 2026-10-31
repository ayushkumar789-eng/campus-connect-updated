import { z } from 'zod';
import { objectId, trimmed, optionalText, stringArray, optionalInt } from './common.js';
import { GROUP_CATEGORIES } from '../modules/groups/Group.model.js';
import { GROUP_ROLES } from '../modules/groups/GroupMember.model.js';

export const paginationQuery = {
  cursor: objectId.optional(),
  limit: optionalInt(1, 50),
};

export const createGroupSchema = z
  .object({
    name: trimmed(3, 60, 'Group name'),
    description: optionalText(1000),
    category: z.enum(GROUP_CATEGORIES).optional(),
    tags: stringArray(10, 30).optional(),
    isPrivate: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    rules: stringArray(10, 200).optional(),
  })
  .strict();

export const updateGroupSchema = z
  .object({
    name: trimmed(3, 60, 'Group name').optional(),
    description: optionalText(1000),
    category: z.enum(GROUP_CATEGORIES).optional(),
    tags: stringArray(10, 30).optional(),
    isPrivate: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
    rules: stringArray(10, 200).optional(),
  })
  .strict();

export const listGroupsQuerySchema = z.object({
  search: optionalText(60),
  category: z.enum(GROUP_CATEGORIES).optional(),
  tags: stringArray(5, 30).optional(),
  ...paginationQuery,
});

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(GROUP_ROLES),
  })
  .strict();

export const idParamSchema = z.object({ id: objectId }).strict();
export const memberParamSchema = z.object({ id: objectId, userId: objectId }).strict();

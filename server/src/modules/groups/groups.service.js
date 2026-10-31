import { Group } from './Group.model.js';
import { GroupMember } from './GroupMember.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadFile, deleteFile } from '../../infrastructure/storage/storage.service.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';

const AUTHOR_FIELDS = 'name username avatar';

export function serialiseGroup(group, viewerId = null, memberRole = null) {
  const g = group.toJSON ? group.toJSON() : group;
  const serialized = {
    id: g._id,
    name: g.name,
    slug: g.slug,
    description: g.description,
    coverImage: g.coverImage,
    category: g.category,
    tags: g.tags,
    memberCount: g.memberCount,
    isPrivate: g.isPrivate,
    rules: g.rules,
    createdAt: g.createdAt,
    creator: g.creator,
  };

  if (g.admins) {
    serialized.admins = g.admins;
  }
  
  if (viewerId) {
    serialized.isMember = Boolean(memberRole);
    serialized.myRole = memberRole || null;
  }
  return serialized;
}

export function serialiseMember(member) {
  return {
    id: member._id,
    user: member.user,
    role: member.role,
    joinedAt: member.createdAt,
  };
}

/** Check access control and return group + viewer's role */
export async function getGroupAndMembership(groupIdOrSlug, userId) {
  const isSlug = typeof groupIdOrSlug === 'string' && !/^[0-9a-fA-F]{24}$/.test(groupIdOrSlug);
  const query = isSlug ? { slug: groupIdOrSlug.toLowerCase() } : { _id: groupIdOrSlug };

  const group = await Group.findOne(query).populate('creator', AUTHOR_FIELDS);
  if (!group) throw ApiError.notFound('Group not found');

  let role = null;
  if (userId) {
    const membership = await GroupMember.findOne({ group: group._id, user: userId });
    if (membership) {
      role = membership.role;
    }
  }

  return { group, role };
}

export async function listGroups(page, filters = {}, viewerId = null) {
  // Conditions are accumulated in `$and` rather than merged onto the top level.
  // A search already claims `$or`, and the privacy clause below needs an `$or`
  // of its own; two `$or` keys on one query cannot coexist, and the second
  // would silently replace the first and drop the search from the query.
  const conditions = [];

  if (filters.search) {
    const rx = new RegExp(filters.search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i');
    conditions.push({ $or: [{ name: rx }, { description: rx }, { tags: rx }] });
  }
  if (filters.category) conditions.push({ category: filters.category });

  // A private group is not discoverable by anyone who is not already in it.
  // Without this a signed-out visitor could enumerate private groups and read
  // their name, description, rules and member count simply by listing them.
  conditions.push(await privateGroupVisibility(viewerId));

  const range = cursorToRange(page);
  if (range) conditions.push(range);

  const groups = await Group.find({ $and: conditions })
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('creator', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(groups, page.limit);
  return { data: data.map(g => serialiseGroup(g, viewerId)), pagination };
}

/**
 * Query fragment restricting a listing to groups `viewerId` is allowed to see.
 *
 * Members still see the private groups they belong to, so this is a visibility
 * rule rather than a blanket exclusion of private groups.
 *
 * @param {string|null} viewerId
 * @returns {Promise<object>}
 */
async function privateGroupVisibility(viewerId) {
  if (!viewerId) return { isPrivate: false };

  const memberships = await GroupMember.find({ user: viewerId }).select('group').lean();
  return {
    $or: [{ isPrivate: false }, { _id: { $in: memberships.map((m) => m.group) } }],
  };
}

/**
 * Resolves a group the viewer is allowed to *read*.
 *
 * Private groups gate their detail and their member list, matching how events,
 * discussions, notes and posts already gate on membership. Applied at these two
 * read entry points rather than inside `getGroupAndMembership`, because that
 * helper also backs the join and mutation paths, which must keep working for
 * non-members.
 */
async function requireReadableGroup(groupIdOrSlug, userId) {
  const { group, role } = await getGroupAndMembership(groupIdOrSlug, userId);

  if (group.isPrivate && !role) {
    // 404 rather than 403: telling a stranger that a private group exists is
    // itself a disclosure, and every sibling module already does this.
    throw ApiError.notFound('Group not found');
  }

  return { group, role };
}

export async function getGroupDetails(groupIdOrSlug, userId) {
  const { group, role } = await requireReadableGroup(groupIdOrSlug, userId);
  return serialiseGroup(group, userId, role);
}

export async function createGroup(payload, creatorId, file) {
  const groupData = { ...payload, creator: creatorId, admins: [creatorId], memberCount: 1 };

  if (file) {
    const uploaded = await uploadFile(file, { folder: 'groups' });
    groupData.coverImage = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const group = await Group.create(groupData);
  
  // Creator becomes admin member
  await GroupMember.create({
    group: group._id,
    user: creatorId,
    role: 'admin',
  });

  const populated = await group.populate('creator', AUTHOR_FIELDS);
  return serialiseGroup(populated, creatorId, 'admin');
}

export async function updateGroup(groupId, payload, userId, file) {
  const { group, role } = await getGroupAndMembership(groupId, userId);
  
  if (role !== 'admin' && String(group.creator._id) !== String(userId)) {
    throw ApiError.forbidden('Only group admins can update group settings');
  }

  Object.assign(group, payload);

  if (file) {
    const uploaded = await uploadFile(file, { folder: 'groups' });
    if (group.coverImage?.publicId) {
      await deleteFile(group.coverImage.publicId, 'auto').catch(() => {});
    }
    group.coverImage = { url: uploaded.url, publicId: uploaded.publicId };
  }

  await group.save();
  return serialiseGroup(group, userId, role);
}

export async function deleteGroup(groupId, userId, userRole) {
  const { group } = await getGroupAndMembership(groupId, userId);
  
  if (String(group.creator._id) !== String(userId) && userRole !== 'admin') {
    throw ApiError.forbidden('Only the creator or system admin can delete this group');
  }

  if (group.coverImage?.publicId) {
    await deleteFile(group.coverImage.publicId, 'auto').catch(() => {});
  }

  await GroupMember.deleteMany({ group: group._id });
  await Group.deleteOne({ _id: group._id });
}

/**
 * Decrements `memberCount` without letting it go negative.
 *
 * The guard belongs in the *filter*, not the update. This used to read
 * `{ memberCount: { $max: [0, group.memberCount - 1] } }` — but `$max` is an
 * update operator, and in a filter position MongoDB looks for a *query* operator
 * by that name, finds none, and rejects the whole statement:
 *
 *     MongoServerError: unknown operator: $max
 *
 * Every leave and every member-removal therefore failed with a 400, and the
 * membership row had already been deleted by the preceding line — so the user
 * was silently removed while the counter stayed put. `memberCount` is a
 * denormalised cache of the `groupmembers` collection; that collection is the
 * source of truth, and `ensure-indexes.js` can rebuild the counter from it.
 */
async function decrementMemberCount(groupId) {
  await Group.updateOne({ _id: groupId, memberCount: { $gt: 0 } }, { $inc: { memberCount: -1 } });
}

export async function joinGroup(groupId, userId) {
  const { group, role } = await getGroupAndMembership(groupId, userId);
  
  if (role) {
    throw ApiError.badRequest('You are already a member of this group');
  }

  if (group.isPrivate) {
    // Audit instruction: Do not invent a pending-request system. 
    // "If private-group requests cannot be represented by the current schema, report that limitation."
    throw ApiError.badRequest('This group is private. Requesting to join is not yet supported in this version.');
  }

  await GroupMember.create({ group: group._id, user: userId, role: 'member' });
  await Group.updateOne({ _id: group._id }, { $inc: { memberCount: 1 } });
  
  return { message: 'Joined group successfully' };
}

export async function leaveGroup(groupId, userId) {
  const { group, role } = await getGroupAndMembership(groupId, userId);
  
  if (!role) {
    throw ApiError.badRequest('You are not a member of this group');
  }

  if (String(group.creator._id) === String(userId)) {
    throw ApiError.badRequest('The creator cannot leave the group. Transfer ownership or delete the group.');
  }

  await GroupMember.deleteOne({ group: group._id, user: userId });
  await decrementMemberCount(group._id);

  return { message: 'Left group successfully' };
}

export async function listMembers(groupId, page, userId) {
  // Gated: the member list of a private group is the sensitive part of it.
  const { group } = await requireReadableGroup(groupId, userId);
  
  const query = { group: group._id };
  const range = cursorToRange(page);
  if (range) Object.assign(query, range);

  const members = await GroupMember.find(query)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('user', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(members, page.limit);
  return { data: data.map(m => serialiseMember(m)), pagination };
}

export async function updateMemberRole(groupId, targetUserId, newRole, requesterId, requesterSystemRole) {
  const { group, role: requesterGroupRole } = await getGroupAndMembership(groupId, requesterId);
  
  const isCreator = String(group.creator._id) === String(requesterId);
  const isSystemAdmin = requesterSystemRole === 'admin';
  const isGroupAdmin = requesterGroupRole === 'admin';

  if (!isCreator && !isSystemAdmin && !isGroupAdmin) {
    throw ApiError.forbidden('You do not have permission to manage roles');
  }

  if (String(group.creator._id) === String(targetUserId)) {
    throw ApiError.badRequest('Cannot change the role of the group creator');
  }

  const membership = await GroupMember.findOne({ group: group._id, user: targetUserId });
  if (!membership) {
    throw ApiError.notFound('User is not a member of this group');
  }

  membership.role = newRole;
  await membership.save();

  // If role is admin, ensure they are in Group.admins
  if (newRole === 'admin') {
    await Group.updateOne({ _id: group._id }, { $addToSet: { admins: targetUserId } });
  } else {
    await Group.updateOne({ _id: group._id }, { $pull: { admins: targetUserId } });
  }
  
  return { message: 'Role updated successfully' };
}

export async function removeMember(groupId, targetUserId, requesterId, requesterSystemRole) {
  const { group, role: requesterGroupRole } = await getGroupAndMembership(groupId, requesterId);
  
  const isCreator = String(group.creator._id) === String(requesterId);
  const isSystemAdmin = requesterSystemRole === 'admin';
  const isGroupAdmin = requesterGroupRole === 'admin';
  const isGroupModerator = requesterGroupRole === 'moderator';

  if (!isCreator && !isSystemAdmin && !isGroupAdmin && !isGroupModerator) {
    throw ApiError.forbidden('You do not have permission to remove members');
  }

  if (String(group.creator._id) === String(targetUserId)) {
    throw ApiError.badRequest('Cannot remove the group creator');
  }
  
  if (String(targetUserId) === String(requesterId)) {
    throw ApiError.badRequest('Use the leave endpoint to remove yourself');
  }

  const membership = await GroupMember.findOne({ group: group._id, user: targetUserId });
  if (!membership) {
    throw ApiError.notFound('User is not a member of this group');
  }
  
  // Moderators cannot remove admins
  if (isGroupModerator && !isGroupAdmin && !isCreator && membership.role === 'admin') {
    throw ApiError.forbidden('Moderators cannot remove admins');
  }

  await GroupMember.deleteOne({ _id: membership._id });
  await decrementMemberCount(group._id);
  await Group.updateOne({ _id: group._id }, { $pull: { admins: targetUserId } });
  
  return { message: 'Member removed successfully' };
}

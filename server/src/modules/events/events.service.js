import { Event } from './Event.model.js';
import { EventRegistration } from './EventRegistration.model.js';
import { Group } from '../groups/Group.model.js';
import { GroupMember } from '../groups/GroupMember.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';
import { getGroupAndMembership } from '../groups/index.js';
import { uploadFile, deleteFile } from '../../infrastructure/storage/storage.service.js';

const AUTHOR_FIELDS = 'name username avatar';

function serialiseEvent(event, viewerId = null) {
  const e = event.toJSON ? event.toJSON() : event;
  
  return {
    id: e._id,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    location: e.location,
    isOnline: e.isOnline,
    meetingLink: e.meetingLink,
    coverImage: e.coverImage,
    organizer: e.organizer,
    group: e.group,
    college: e.college,
    registrationCount: e.registrationCount,
    capacity: e.capacity,
    tags: e.tags,
    createdAt: e.createdAt,
    isOwner: viewerId ? String(e.organizer?._id ?? e.organizer) === String(viewerId) : false,
  };
}

export async function listEvents(page, filters = {}, viewerId = null) {
  const query = {};

  if (filters.search) {
    query.$text = { $search: filters.search };
  }
  if (filters.tags && filters.tags.length > 0) {
    query.tags = { $in: filters.tags };
  }
  if (filters.college) {
    query.college = filters.college;
  }
  
  const now = new Date();
  if (filters.type === 'upcoming') {
    query.startsAt = { $gte: now };
  } else if (filters.type === 'past') {
    query.startsAt = { $lt: now };
  }

  if (filters.group) {
    const { group, role } = await getGroupAndMembership(filters.group, viewerId);
    if (group.isPrivate && !role) throw ApiError.forbidden('Private group');
    query.group = filters.group;
  } else {
    // Exclude private group events from global listing if the user is not a member
    const privateGroups = await Group.find({ isPrivate: true }).select('_id');
    const userGroups = viewerId ? await GroupMember.find({ user: viewerId }).select('group') : [];
    
    const blockedGroupIds = privateGroups
      .map((g) => String(g._id))
      .filter((id) => !userGroups.some((ug) => String(ug.group) === id));

    if (blockedGroupIds.length > 0) {
      query.group = { $nin: blockedGroupIds };
    }
  }

  const range = cursorToRange(page);
  if (range && !filters.search) {
    query._id = range._id;
  }

  const events = await Event.find(query)
    .sort(filters.search ? { score: { $meta: 'textScore' } } : page.sort)
    .limit(page.limit + 1)
    .populate('organizer', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(events, page.limit);
  return { data: data.map((e) => serialiseEvent(e, viewerId)), pagination };
}

export async function getEventById(id, viewerId = null) {
  const event = await Event.findById(id).populate('organizer', AUTHOR_FIELDS).lean();
  if (!event) throw ApiError.notFound('Event not found');

  if (event.group) {
    const { group, role } = await getGroupAndMembership(event.group, viewerId);
    if (group.isPrivate && !role) {
      throw ApiError.forbidden('This event belongs to a private group');
    }
  }

  return serialiseEvent(event, viewerId);
}

export async function createEvent(payload, organizerId, file = null) {
  if (payload.group) {
    const { role } = await getGroupAndMembership(payload.group, organizerId);
    if (!role) throw ApiError.forbidden('You must be a member of the group to create events in it');
  }

  const eventData = { ...payload, organizer: organizerId };

  if (file) {
    const uploaded = await uploadFile(file, { folder: 'events' });
    eventData.coverImage = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const event = await Event.create(eventData);
  const populated = await event.populate('organizer', AUTHOR_FIELDS);
  return serialiseEvent(populated, organizerId);
}

export async function updateEvent(id, payload, userId, userRole, file = null) {
  const event = await Event.findById(id);
  if (!event) throw ApiError.notFound('Event not found');

  const isOrganizer = String(event.organizer) === String(userId);
  let isGroupAdmin = false;

  if (event.group) {
    const membership = await GroupMember.findOne({ group: event.group, user: userId });
    if (membership && (membership.role === 'admin' || membership.role === 'moderator')) {
      isGroupAdmin = true;
    }
  }

  if (!isOrganizer && !isGroupAdmin && userRole !== 'admin') {
    throw ApiError.forbidden('You are not authorized to update this event');
  }

  // Handle group transition verification if group changes
  if (payload.group && String(payload.group) !== String(event.group)) {
    const { role } = await getGroupAndMembership(payload.group, userId);
    if (!role) throw ApiError.forbidden('You must be a member of the new group');
  }

  if (file) {
    if (event.coverImage?.publicId) {
      await deleteFile(event.coverImage.publicId, 'auto').catch(() => {});
    }
    const uploaded = await uploadFile(file, { folder: 'events' });
    payload.coverImage = { url: uploaded.url, publicId: uploaded.publicId };
  }

  Object.assign(event, payload);
  await event.save();
  
  const populated = await event.populate('organizer', AUTHOR_FIELDS);
  return serialiseEvent(populated, userId);
}

export async function deleteEvent(id, userId, userRole) {
  const event = await Event.findById(id);
  if (!event) throw ApiError.notFound('Event not found');

  const isOrganizer = String(event.organizer) === String(userId);
  let isGroupAdmin = false;

  if (event.group) {
    const membership = await GroupMember.findOne({ group: event.group, user: userId });
    if (membership && (membership.role === 'admin' || membership.role === 'moderator')) {
      isGroupAdmin = true;
    }
  }

  if (!isOrganizer && !isGroupAdmin && userRole !== 'admin') {
    throw ApiError.forbidden('You are not authorized to delete this event');
  }

  if (event.coverImage?.publicId) {
    await deleteFile(event.coverImage.publicId, 'auto').catch(() => {});
  }

  await EventRegistration.deleteMany({ event: event._id });
  await Event.deleteOne({ _id: event._id });
}

export async function registerForEvent(eventId, userId) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('Event not found');

  if (event.group) {
    const { group, role } = await getGroupAndMembership(event.group, userId);
    if (group.isPrivate && !role) throw ApiError.forbidden('This event belongs to a private group');
  }

  if (event.endsAt && new Date() > event.endsAt) {
    throw ApiError.badRequest('Cannot register for an event that has already ended');
  }

  try {
    await EventRegistration.create({ event: event._id, user: userId });
  } catch (err) {
    if (err.code === 11000) {
      throw ApiError.conflict('You are already registered for this event');
    }
    throw err;
  }

  const query = { _id: event._id };
  if (event.capacity != null) {
    query.registrationCount = { $lt: event.capacity };
  }

  const updated = await Event.findOneAndUpdate(query, { $inc: { registrationCount: 1 } });
  
  if (!updated) {
    await EventRegistration.deleteOne({ event: event._id, user: userId });
    throw ApiError.badRequest('Event is at full capacity');
  }

  return { registered: true };
}

export async function cancelRegistration(eventId, userId) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('Event not found');

  const result = await EventRegistration.deleteOne({ event: event._id, user: userId });
  if (result.deletedCount === 0) {
    throw ApiError.notFound('You are not registered for this event');
  }

  await Event.updateOne(
    { _id: event._id, registrationCount: { $gt: 0 } },
    { $inc: { registrationCount: -1 } }
  );
}

export async function getAttendees(eventId, viewerId, page) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('Event not found');

  if (event.group) {
    const { group, role } = await getGroupAndMembership(event.group, viewerId);
    if (group.isPrivate && !role) throw ApiError.forbidden('This event belongs to a private group');
  }

  const query = { event: event._id, ...cursorToRange(page) };
  
  const attendees = await EventRegistration.find(query)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('user', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(attendees, page.limit);
  return {
    data: data.map(doc => ({
      id: doc._id,
      user: doc.user,
      createdAt: doc.createdAt
    })),
    pagination
  };
}

export async function getRegistrationStatus(eventId, userId) {
  const reg = await EventRegistration.findOne({ event: eventId, user: userId }).lean();
  return { registered: !!reg };
}

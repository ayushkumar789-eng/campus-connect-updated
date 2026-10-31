import { Note } from './Note.model.js';
import { Group } from '../groups/Group.model.js';
import { GroupMember } from '../groups/GroupMember.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadFile, deleteFile } from '../../infrastructure/storage/storage.service.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';
import { AUTHOR_FIELDS } from '../../shared/constants.js';

/**
 * Turns a Note document into the exact shape the client renders
 */
export function serialiseNote(note, viewerId = null) {
  const author = note.uploadedBy
    ? {
        id: note.uploadedBy._id ?? note.uploadedBy,
        name: note.uploadedBy.name,
        username: note.uploadedBy.username,
        avatar: note.uploadedBy.avatar?.url ?? '',
        college: note.uploadedBy.college,
        course: note.uploadedBy.course,
        year: note.uploadedBy.year,
      }
    : null;

  return {
    id: note._id,
    title: note.title,
    description: note.description,
    subject: note.subject,
    course: note.course,
    branch: note.branch,
    semester: note.semester,
    year: note.year,
    file: note.file,
    previewImages: note.previewImages,
    tags: note.tags,
    author,
    group: note.group ?? null,
    downloadCount: note.downloadCount,
    averageRating: note.averageRating,
    ratingCount: note.ratingCount,
    isOwner: viewerId ? String(note.uploadedBy?._id ?? note.uploadedBy) === String(viewerId) : false,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export async function getNotes(filter, page, viewerId) {
  const query = {};

  if (filter.search) {
    query.$text = { $search: filter.search };
  }
  if (filter.subject) {
    // Escaped, so a subject containing regex metacharacters is matched
    // literally. `groups.service.js` already does this for its search filter;
    // an unescaped value here means `?subject=.*` matches every note, and a
    // malformed pattern is a 500 rather than an empty result.
    const escaped = String(filter.subject).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    query.subject = { $regex: escaped, $options: 'i' };
  }
  if (filter.course) {
    query.course = filter.course;
  }
  if (filter.semester) {
    query.semester = filter.semester;
  }
  if (filter.uploadedBy) {
    query.uploadedBy = filter.uploadedBy;
  }
  
  if (filter.group) {
    const groupDoc = await Group.findById(filter.group);
    if (!groupDoc) throw ApiError.notFound('Group not found');
    if (groupDoc.isPrivate) {
      if (!viewerId) throw ApiError.forbidden('This is a private group');
      const membership = await GroupMember.exists({ group: filter.group, user: viewerId });
      if (!membership) throw ApiError.forbidden('This is a private group');
    }
    query.group = filter.group;
  } else {
    // Exclude group notes from global notes listing
    query.group = null;
  }

  const range = cursorToRange(page);
  // If searching by text, cursor pagination can be tricky because text search sorts by score. 
  // We'll just apply range if it exists.
  if (range && !filter.search) {
    query._id = range._id;
  }

  const items = await Note.find(query)
    .sort(filter.search ? { score: { $meta: 'textScore' } } : page.sort)
    .limit(page.limit + 1)
    .populate('uploadedBy', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(items, page.limit);
  
  return {
    data: data.map((n) => serialiseNote(n, viewerId)),
    pagination,
  };
}

export async function getNoteById(id, viewerId) {
  const note = await Note.findById(id).populate('uploadedBy', AUTHOR_FIELDS).lean();
  if (!note) throw ApiError.notFound('Note not found');
  
  if (note.group) {
    const groupDoc = await Group.findById(note.group);
    if (groupDoc && groupDoc.isPrivate) {
      if (!viewerId) throw ApiError.forbidden('This note belongs to a private group');
      const isOwner = String(note.uploadedBy._id) === String(viewerId);
      if (!isOwner) {
        const membership = await GroupMember.exists({ group: note.group, user: viewerId });
        if (!membership) throw ApiError.forbidden('This note belongs to a private group');
      }
    }
  }
  
  return serialiseNote(note, viewerId);
}

export async function createNote(input, fileBuffer, authorId) {
  if (!fileBuffer) {
    throw ApiError.badRequest('A file is required to create a note');
  }

  if (input.group) {
    const membership = await GroupMember.findOne({ group: input.group, user: authorId });
    if (!membership) {
      throw ApiError.forbidden('You must be a member of the group to post resources in it');
    }
  }

  // Upload the file
  const uploaded = await uploadFile(fileBuffer, { folder: 'notes' });

  const note = new Note({
    ...input,
    uploadedBy: authorId,
    file: {
      url: uploaded.url,
      publicId: uploaded.publicId,
      name: uploaded.name,
      mimetype: uploaded.mimetype,
      size: uploaded.size,
    },
  });

  await note.save();
  await note.populate('uploadedBy', AUTHOR_FIELDS);
  
  return serialiseNote(note.toObject(), authorId);
}

export async function updateNote(id, input, fileBuffer, authorId) {
  const note = await Note.findById(id);
  if (!note) throw ApiError.notFound('Note not found');
  
  if (String(note.uploadedBy) !== String(authorId)) {
    throw ApiError.forbidden('You can only edit your own notes');
  }

  // Update text fields
  Object.assign(note, input);

  // If a new file is provided, upload it and delete the old one
  if (fileBuffer) {
    const uploaded = await uploadFile(fileBuffer, { folder: 'notes' });
    
    // Attempt to delete old file from storage if it exists and has publicId
    if (note.file?.publicId) {
      await deleteFile(note.file.publicId, 'auto').catch(() => {}); // fire and forget
    }

    note.file = {
      url: uploaded.url,
      publicId: uploaded.publicId,
      name: uploaded.name,
      mimetype: uploaded.mimetype,
      size: uploaded.size,
    };
  }

  await note.save();
  await note.populate('uploadedBy', AUTHOR_FIELDS);
  
  return serialiseNote(note.toObject(), authorId);
}

export async function deleteNote(id, user) {
  const note = await Note.findById(id);
  if (!note) throw ApiError.notFound('Note not found');
  
  const isOwner = String(note.uploadedBy) === String(user._id);
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own notes');
  }

  if (note.file?.publicId) {
    await deleteFile(note.file.publicId, 'auto').catch(() => {});
  }

  await note.deleteOne();
  return { id };
}

export async function incrementDownload(id) {
  const note = await Note.findByIdAndUpdate(
    id,
    { $inc: { downloadCount: 1 } },
    { new: true }
  ).lean();
  
  if (!note) throw ApiError.notFound('Note not found');
  
  return { downloadCount: note.downloadCount };
}

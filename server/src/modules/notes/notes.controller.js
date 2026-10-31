import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination } from '../../utils/pagination.js';
import {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  incrementDownload,
} from './notes.service.js';

export const listNotes = asyncHandler(async (req, res) => {
  const page = getPagination(req);
  const filter = {
    search: req.query.search,
    subject: req.query.subject,
    course: req.query.course,
    semester: req.query.semester,
    uploadedBy: req.query.uploadedBy,
  };

  const viewerId = req.user?._id ?? null;
  const { data, pagination } = await getNotes(filter, page, viewerId);

  res.json({ success: true, data, pagination });
});

export const getNote = asyncHandler(async (req, res) => {
  const viewerId = req.user?._id ?? null;
  const data = await getNoteById(req.params.id, viewerId);
  res.json({ success: true, data });
});

export const create = asyncHandler(async (req, res) => {
  const file = req.file;
  const data = await createNote(req.body, file, req.user._id);
  res.status(201).json({ success: true, message: 'Note created', data });
});

export const update = asyncHandler(async (req, res) => {
  const file = req.file;
  const data = await updateNote(req.params.id, req.body, file, req.user._id);
  res.json({ success: true, message: 'Note updated', data });
});

export const remove = asyncHandler(async (req, res) => {
  await deleteNote(req.params.id, req.user);
  res.json({ success: true, message: 'Note deleted' });
});

export const downloadCount = asyncHandler(async (req, res) => {
  const data = await incrementDownload(req.params.id);
  res.json({ success: true, data });
});

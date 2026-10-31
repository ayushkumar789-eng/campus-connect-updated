import * as eventService from './events.service.js';
import * as eventValidator from '../../validators/event.validator.js';
import { getPagination } from '../../utils/pagination.js';

export async function listEvents(req, res) {
  const page = getPagination(req, { defaultSort: 'startsAt' });
  const filters = eventValidator.listEventsQuerySchema.parse(req.query);
  const result = await eventService.listEvents(page, filters, req.user?._id);
  res.json(result);
}

export async function getEventDetails(req, res) {
  const { id } = req.params;
  const result = await eventService.getEventById(id, req.user?._id);
  res.json({ data: result });
}

export async function createEvent(req, res) {
  const payload = eventValidator.createEventSchema.parse(req.body);
  const result = await eventService.createEvent(payload, req.user._id, req.file);
  res.status(201).json({ data: result });
}

export async function updateEvent(req, res) {
  const { id } = req.params;
  const payload = eventValidator.updateEventSchema.parse(req.body);
  const result = await eventService.updateEvent(id, payload, req.user._id, req.user.role, req.file);
  res.json({ data: result });
}

export async function deleteEvent(req, res) {
  const { id } = req.params;
  await eventService.deleteEvent(id, req.user._id, req.user.role);
  res.status(204).end();
}

export async function register(req, res) {
  const { id } = req.params;
  const result = await eventService.registerForEvent(id, req.user._id);
  res.status(201).json({ data: result });
}

export async function cancelRegistration(req, res) {
  const { id } = req.params;
  await eventService.cancelRegistration(id, req.user._id);
  res.status(204).end();
}

export async function getAttendees(req, res) {
  const { id } = req.params;
  const page = getPagination(req);
  const result = await eventService.getAttendees(id, req.user?._id, page);
  res.json(result);
}

export async function getRegistrationStatus(req, res) {
  const { id } = req.params;
  const result = await eventService.getRegistrationStatus(id, req.user._id);
  res.json({ data: result });
}

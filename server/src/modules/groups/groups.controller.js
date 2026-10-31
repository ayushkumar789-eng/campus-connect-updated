import * as groupService from './groups.service.js';
import * as postService from '../posts/index.js';
import * as groupValidator from '../../validators/group.validator.js';
import { getPagination } from '../../utils/pagination.js';

export async function listGroups(req, res) {
  const page = getPagination(req);
  const filters = groupValidator.listGroupsQuerySchema.parse(req.query);
  // The viewer is passed through so private groups are hidden from non-members.
  const result = await groupService.listGroups(page, filters, req.user?._id);
  res.json(result);
}

export async function getGroupDetails(req, res) {
  const { id } = req.params;
  const result = await groupService.getGroupDetails(id, req.user?._id);
  res.json(result);
}

export async function getGroupPosts(req, res) {
  const { id } = req.params;
  const page = getPagination(req);
  const result = await postService.getPostsByGroup(id, req.user?._id, page);
  res.json(result);
}

export async function createGroup(req, res) {
  const payload = groupValidator.createGroupSchema.parse(req.body);
  const result = await groupService.createGroup(payload, req.user._id, req.file);
  res.status(201).json(result);
}

export async function updateGroup(req, res) {
  const { id } = req.params;
  const payload = groupValidator.updateGroupSchema.parse(req.body);
  const result = await groupService.updateGroup(id, payload, req.user._id, req.file);
  res.json(result);
}

export async function deleteGroup(req, res) {
  const { id } = req.params;
  await groupService.deleteGroup(id, req.user._id, req.user.role);
  res.status(204).end();
}

export async function joinGroup(req, res) {
  const { id } = req.params;
  const result = await groupService.joinGroup(id, req.user._id);
  res.json(result);
}

export async function leaveGroup(req, res) {
  const { id } = req.params;
  const result = await groupService.leaveGroup(id, req.user._id);
  res.json(result);
}

export async function listMembers(req, res) {
  const { id } = req.params;
  const page = getPagination(req);
  const result = await groupService.listMembers(id, page, req.user?._id);
  res.json(result);
}

export async function updateMemberRole(req, res) {
  const { id, userId } = req.params;
  const { role } = groupValidator.updateMemberRoleSchema.parse(req.body);
  const result = await groupService.updateMemberRole(id, userId, role, req.user._id, req.user.role);
  res.json(result);
}

export async function removeMember(req, res) {
  const { id, userId } = req.params;
  const result = await groupService.removeMember(id, userId, req.user._id, req.user.role);
  res.json(result);
}

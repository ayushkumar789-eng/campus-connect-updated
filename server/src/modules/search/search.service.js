import { User } from '../users/User.model.js';
import { Post } from '../posts/Post.model.js';
import { Group } from '../groups/Group.model.js';
import { Note } from '../notes/Note.model.js';
import { Discussion } from '../discussions/Discussion.model.js';
import { serialisePost, savedIdsFor } from '../posts/index.js';
import { AUTHOR_FIELDS } from '../../shared/constants.js';

/** Escapes user input so it is safe to embed in a RegExp. */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Global search across the five indexable surfaces.
 *
 * Uses regex rather than $text so partial words match as the user types
 * ("rea" → "React"), which is what a search-as-you-type box needs.
 *
 * @param {string} rawQuery
 * @param {string|null} viewerId
 * @param {number} limit per-tab result count
 */
export async function globalSearch(rawQuery, viewerId = null, limit = 8) {
  const q = rawQuery.trim();
  const rx = new RegExp(escapeRegex(q), 'i');

  const [users, posts, groups, notes, discussions] = await Promise.all([
    User.find({
      $or: [{ name: rx }, { username: rx }, { college: rx }, { skills: rx }],
    })
      .select('name username avatar college course year skills')
      .limit(limit)
      .lean(),

    Post.find({ content: rx, visibility: 'public' })
      .sort('-createdAt')
      .limit(limit)
      .populate('author', AUTHOR_FIELDS)
      .lean(),

    Group.find({ $or: [{ name: rx }, { description: rx }, { tags: rx }] })
      .select('name slug description coverImage category memberCount')
      .limit(limit)
      .lean(),

    Note.find({ $or: [{ title: rx }, { description: rx }, { subject: rx }, { tags: rx }] })
      .sort('-createdAt')
      .limit(limit)
      .select('title description subject course semester file uploadedBy downloadCount averageRating')
      .populate('uploadedBy', AUTHOR_FIELDS)
      .lean(),

    Discussion.find({ $or: [{ title: rx }, { body: rx }, { tags: rx }] })
      .sort('-score')
      .limit(limit)
      .select('title body category score commentCount upvotes')
      .populate('author', AUTHOR_FIELDS)
      .lean(),
  ]);

  const savedIds = await savedIdsFor(viewerId, posts);

  return {
    query: q,
    students: users.map((u) => ({
      id: u._id,
      name: u.name,
      username: u.username,
      avatar: u.avatar?.url ?? '',
      college: u.college,
      course: u.course,
      year: u.year,
      skills: u.skills,
    })),
    posts: posts.map((p) => serialisePost(p, viewerId, savedIds)),
    groups: groups.map((g) => ({
      id: g._id,
      name: g.name,
      slug: g.slug,
      description: g.description,
      coverImage: g.coverImage?.url ?? '',
      category: g.category,
      memberCount: g.memberCount,
    })),
    notes: notes.map((n) => ({
      id: n._id,
      title: n.title,
      description: n.description,
      subject: n.subject,
      course: n.course,
      semester: n.semester,
      file: n.file,
      uploadedBy: n.uploadedBy,
      downloadCount: n.downloadCount,
      averageRating: n.averageRating,
    })),
    discussions: discussions.map((d) => ({
      id: d._id,
      title: d.title,
      body: d.body,
      category: d.category,
      score: d.score,
      upvotes: d.upvotes,
      commentCount: d.commentCount,
      author: d.author,
    })),
    total:
      users.length + posts.length + groups.length + notes.length + discussions.length,
  };
}

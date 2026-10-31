#!/usr/bin/env node
/**
 * Seeds a realistic CampusConnect dataset so the UI can be demoed without
 * hand-creating accounts. Safe to re-run: it clears the collections it owns.
 *
 * Usage: node src/scripts/seed.js [--keep]
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User } from '../modules/users/User.model.js';
import { Post } from '../modules/posts/Post.model.js';
import { Comment } from '../modules/posts/Comment.model.js';
import { Like } from '../modules/posts/Like.model.js';
import { Follow } from '../modules/users/Follow.model.js';
import { SavedPost } from '../modules/saved/SavedPost.model.js';
import { Group } from '../modules/groups/Group.model.js';
import { GroupMember } from '../modules/groups/GroupMember.model.js';
import { Discussion } from '../modules/discussions/Discussion.model.js';
import { Note } from '../modules/notes/Note.model.js';
import { Event } from '../modules/events/Event.model.js';
import { Report } from '../modules/reports/Report.model.js';
import { Notification } from '../modules/notifications/Notification.model.js';

/**
 * Demo accounts are pre-verified.
 *
 * The model default is `emailVerified: false`, so without this every seeded
 * account lands on the "check your inbox" screen after `npm run seed` — for an
 * address nobody can receive mail at (`@campus.test`). These are fixture
 * accounts representing students who already completed signup.
 *
 * Scoped to the seed on purpose. It says nothing about the verification flow
 * itself: the endpoint, the token, the cooldown and
 * `EMAIL_VERIFICATION_DEV_BYPASS` are all untouched, and production still
 * refuses to boot with that bypass enabled. Set SEED_EMAIL_VERIFIED=false to
 * exercise the real verification flow against the demo data.
 */
const SEED_EMAIL_VERIFIED = process.env.SEED_EMAIL_VERIFIED !== 'false';

// ── Fixture data ──────────────────────────────────────────────────────────
const PASSWORD = 'Student@2026';

const students = [
  { name: 'Ayush Kumar',  username: 'ayush',  email: 'ayush@campus.test',  course: 'MCA', year: 2, branch: 'Computer Science',
    bio: 'Building for the web. React, Node and too many side projects.', skills: ['React', 'Node.js', 'MongoDB'], interests: ['Open Source', 'DSA'] },
  { name: 'Rahul Sharma', username: 'rahul_sharma', email: 'rahul@campus.test', course: 'MCA', year: 2, branch: 'Computer Science',
    bio: 'Java backend enthusiast. Ask me about Spring Boot.', skills: ['Java', 'Spring Boot', 'SQL'], interests: ['Placement Prep'] },
  { name: 'Priya Verma',  username: 'priya_verma',  email: 'priya@campus.test', course: 'MCA', year: 2, branch: 'Computer Science',
    bio: 'Notes archivist. If it was in the syllabus, I have it.', skills: ['DBMS', 'Operating Systems', 'Documentation'], interests: ['Academics', 'Teaching'] },
  { name: 'Aman Gupta',   username: 'aman_gupta',   email: 'aman@campus.test',  course: 'BCA', year: 3, branch: 'Computer Applications',
    bio: 'UI nerd. Figma all day.', skills: ['UI/UX', 'Figma', 'CSS'], interests: ['Design', 'Photography'] },
  { name: 'Sneha Iyer',   username: 'sneha_iyer',   email: 'sneha@campus.test', course: 'MCA', year: 1, branch: 'Computer Science',
    bio: 'First year. Learning in public.', skills: ['Python', 'C'], interests: ['DSA', 'Robotics'] },
  { name: 'Vikram Singh', username: 'vikram_singh', email: 'vikram@campus.test', course: 'B.Tech', year: 3, branch: 'CSE',
    bio: 'Competitive programmer. 1600+ on Codechef.', skills: ['C++', 'Algorithms'], interests: ['DSA', 'Competitive Programming'] },
];

const groups = [
  { name: 'MCA 2026', description: 'Everyone in the 2026 MCA batch. Notes, doubts, placements and memes.', category: 'course', tags: ['mca', 'batch'] },
  { name: 'Java Developers', description: 'Java, Spring Boot, backend architecture and placement-ready projects.', category: 'development', tags: ['java', 'backend'] },
  { name: 'React Developers', description: 'React, hooks, state management and real-world UI patterns.', category: 'development', tags: ['react', 'frontend'] },
  { name: 'DSA Preparation', description: 'Data structures, algorithms and interview prep. Daily one problem minimum.', category: 'placement', tags: ['dsa', 'interviews'] },
  { name: 'UI/UX Designers', description: 'Design systems, Figma critique and portfolio reviews.', category: 'development', tags: ['design', 'figma'] },
];

const discussions = [
  { title: 'How should I prepare for DSA in the next 3 months?', body: 'I have around 12 weeks before placement season starts. Currently brushing easy problems on LeetCode. What is a realistic plan that actually gets you through medium-level arrays and trees?', category: 'placements', tags: ['dsa', 'planning'], upvotes: 245, commentCount: 48 },
  { title: 'Best Java backend project ideas for a fresher resume?', body: 'Something beyond "todo app" and "ecommerce". Looking for a project that shows real backend thinking — auth, caching, queues.', category: 'projects', tags: ['java', 'projects'], upvotes: 128, commentCount: 31 },
  { title: 'Is MongoDB fine for a college project, or should I learn SQL properly?', body: 'Our mini project needs relational data but everyone on the team knows Mongoose. Worth the switch?', category: 'academics', tags: ['db', 'mongodb'], upvotes: 76, commentCount: 22 },
  { title: 'How do you keep notes organised across 6 subjects?', body: 'My drive is chaos. Looking for a folder structure and naming convention that survives a full semester.', category: 'academics', tags: ['notes', 'organisation'], upvotes: 54, commentCount: 17 },
  { title: 'Anyone else switching from DSA to development this semester?', body: 'Struggling with the balance. Placement prep says grind LeetCode, but I want an actual stack to talk about in interviews.', category: 'career', tags: ['career', 'placement'], upvotes: 39, commentCount: 19 },
];

const events = [
  { title: 'Hackathon 2026', description: '24-hour build sprint. Teams of 2-3, mentors on site, prizes for best product and best design.', location: 'Main Auditorium', daysFromNow: 14, tags: ['hackathon', 'coding'] },
  { title: 'Tech Fest', description: 'Project expo, guest talks from industry engineers, and a hiring booth.', location: 'Block C Courtyard', daysFromNow: 22, tags: ['expo', 'talks'] },
  { title: 'DSA Mock Interview Drive', description: 'Volunteer-driven mock interviews. Register in pairs and practise whiteboard style.', location: 'Seminar Hall 2', daysFromNow: 7, tags: ['interviews', 'dsa'] },
];

const postFixtures = [
  { author: 'rahul_sharma', content: 'Just completed my React project 🚀 Three weeks, two rewrites, one very tired developer. Would love feedback on the state management approach.', likes: 124, comments: [['priya_verma', 'The reducer pattern looks clean. Nice work!'], ['ayush', 'Can you share the repo? I am building something similar.']] },
  { author: 'priya_verma', content: 'Uploaded DBMS notes 📚 Normalisation, transactions and the full ER modelling section, cleaned up and exam-ready.', resource: { title: 'DBMS_Unit_3.pdf', name: 'DBMS_Unit_3.pdf' }, likes: 89, comments: [['aman_gupta', 'This is exactly what I needed, thank you!']] },
  { author: 'aman_gupta', content: 'Redesigned our college notice board as a PWA. Offline-first, installable, and it loads instantly on the hostel Wi-Fi. Screenshots in the comments.', likes: 210, comments: [['vikram_singh', 'The typography is so much better than the original site.'], ['sneha_iyer', 'Adding this to my portfolio inspirations.']] },
  { author: 'vikram_singh', content: 'Solved 200 problems on LeetCode this month. Consistency beats intensity — 7 a day, every day, no exceptions. Sharing my sheet if anyone wants it.', likes: 156, comments: [['rahul_sharma', 'Which sheet? The company-wise one or topic-wise?']] },
  { author: 'sneha_iyer', content: 'First week of college and I already have three questions nobody answered in class. Starting a doc for the batch — add yours!', likes: 34, comments: [] },
  { author: 'ayush', content: 'Anyone else find that the best way to learn a framework is to rebuild something you already understand? Rebuilt my notes app in plain JavaScript after years of frameworks. Learned more in a weekend than in a month.', likes: 298, comments: [['priya_verma', 'This is the right instinct. Fundamentals first, always.'], ['aman_gupta', 'Same thing happened to me with CSS.'], ['rahul_sharma', 'Bookmarking this.']] },
];

// ── Seeding ───────────────────────────────────────────────────────────────
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const daysAhead = (n) => new Date(Date.now() + n * 86_400_000);

async function seed() {
  await connectDB();
  console.log('🧹 Clearing seeded collections...');
  await Promise.all([
    User.deleteMany({}),
    Post.deleteMany({}),
    Comment.deleteMany({}),
    Like.deleteMany({}),
    Follow.deleteMany({}),
    SavedPost.deleteMany({}),
    Group.deleteMany({}),
    GroupMember.deleteMany({}),
    Discussion.deleteMany({}),
    Note.deleteMany({}),
    Event.deleteMany({}),
    Report.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  console.log('👤 Creating students...');
  const users = await User.create(
    students.map((s) => ({
      ...s,
      college: 'Invertis University',
      password: PASSWORD,
      profileCompleted: true,
      emailVerified: SEED_EMAIL_VERIFIED,
      ...(SEED_EMAIL_VERIFIED ? { emailVerifiedAt: new Date() } : {}),
    })),
  );
  const byUsername = new Map(users.map((u) => [u.username, u]));

/**
 * Tallies posts per author username.
 * @param {{ author: unknown }[]} posts
 * @returns {Map<string, number>}
 */
function countByAuthor(posts) {
  const tally = new Map();
  for (const post of posts) {
    const username = users.find((u) => String(u._id) === String(post.author))?.username;
    if (username) tally.set(username, (tally.get(username) ?? 0) + 1);
  }
  return tally;
}

  // First account is the demo admin.
  const admin = await User.create({
    name: 'Campus Admin',
    username: 'admin',
    email: 'admin@campus.test',
    password: PASSWORD,
    college: 'Invertis University',
    course: 'MCA',
    year: 1,
    role: 'admin',
    profileCompleted: true,
    emailVerified: SEED_EMAIL_VERIFIED,
    ...(SEED_EMAIL_VERIFIED ? { emailVerifiedAt: new Date() } : {}),
    bio: 'Platform administrator.',
  });
  byUsername.set('admin', admin);
  console.log(`   ${users.length + 1} accounts created (password: ${PASSWORD})`);

  console.log('🔗 Building the follow graph...');
  const followPairs = [
    ['ayush', 'rahul_sharma'], ['ayush', 'priya_verma'], ['ayush', 'aman_gupta'],
    ['rahul_sharma', 'ayush'], ['rahul_sharma', 'priya_verma'],
    ['priya_verma', 'ayush'], ['priya_verma', 'sneha_iyer'],
    ['aman_gupta', 'ayush'], ['vikram_singh', 'ayush'], ['sneha_iyer', 'priya_verma'],
  ];
  await Follow.insertMany(
    followPairs.map(([a, b]) => ({ follower: byUsername.get(a)._id, following: byUsername.get(b)._id })),
  );
  await User.updateOne({ _id: byUsername.get('ayush')._id }, { $set: { followersCount: 5, followingCount: 3 } });
  await User.updateOne({ _id: byUsername.get('rahul_sharma')._id }, { $set: { followersCount: 2, followingCount: 2 } });
  await User.updateOne({ _id: byUsername.get('priya_verma')._id }, { $set: { followersCount: 3, followingCount: 2 } });
  await User.updateOne({ _id: byUsername.get('aman_gupta')._id }, { $set: { followersCount: 2, followingCount: 1 } });
  await User.updateOne({ _id: byUsername.get('sneha_iyer')._id }, { $set: { followersCount: 2, followingCount: 1 } });
  await User.updateOne({ _id: byUsername.get('vikram_singh')._id }, { $set: { followersCount: 1, followingCount: 1 } });

  console.log('👥 Creating groups...');
  const createdGroups = await Group.create(
    groups.map((g, i) => ({
      ...g,
      creator: byUsername.get('ayush')._id,
      admins: [byUsername.get('ayush')._id],
      memberCount: 40 + i * 137,
    })),
  );
  await GroupMember.insertMany(
    createdGroups.flatMap((g) => [
      { group: g._id, user: byUsername.get('ayush')._id, role: 'admin' },
      { group: g._id, user: byUsername.get('rahul_sharma')._id, role: 'member' },
    ]),
  );

  console.log('📝 Creating posts...');
  const createdPosts = [];
  for (const [i, fixture] of postFixtures.entries()) {
    const author = byUsername.get(fixture.author);
    const likers = users.filter((u) => u.username !== fixture.author).slice(0, Math.min(fixture.likes % users.length, users.length));
    const extraLikes = Math.max(0, fixture.likes - likers.length);

    const post = await Post.create({
      author: author._id,
      content: fixture.content,
      type: fixture.resource ? 'resource' : 'text',
      likedBy: likers.map((u) => u._id),
      likeCount: fixture.likes,
      commentCount: fixture.comments.length,
      createdAt: daysAgo(i + 1),
      ...(fixture.resource
        ? {
            resource: {
              title: fixture.resource.title,
              fileUrl: `${process.env.SERVER_URL ?? 'http://localhost:5050'}/uploads/seed/${fixture.resource.name}`,
              name: fixture.resource.name,
              mimetype: 'application/pdf',
              size: 482_113,
            },
          }
        : {}),
    });
    createdPosts.push(post);

    if (likers.length) {
      await Like.insertMany(likers.map((u) => ({ user: u._id, post: post._id })));
    }
    if (extraLikes) {
      // Counter exceeds the number of seeded liker accounts; that is fine, it
      // represents likes from the wider campus.
      console.log(`   (+${extraLikes} implied likes on "${fixture.content.slice(0, 30)}…")`);
    }

    for (const [i2, [commenter, text]] of fixture.comments.entries()) {
      await Comment.create({
        post: post._id,
        author: byUsername.get(commenter)._id,
        content: text,
        createdAt: daysAgo(i + 1 - i2 * 0.2),
      });
    }
  }
  // Counters are derived from the fixtures rather than hand-incremented, so a
  // profile can never advertise "0 posts" while the feed shows one.
  for (const [username, count] of countByAuthor(createdPosts)) {
    await User.updateOne({ _id: byUsername.get(username)._id }, { postsCount: count });
  }

  // A poll, so the feed demonstrates that post type too.
  const pollPost = await Post.create({
    author: byUsername.get('vikram_singh')._id,
    content: 'Which language are you learning this semester?',
    type: 'poll',
    poll: {
      question: 'Which language are you learning this semester?',
      options: [
        { text: 'Java', votes: [byUsername.get('rahul_sharma')._id] },
        { text: 'Python', votes: [byUsername.get('sneha_iyer')._id, byUsername.get('ayush')._id] },
        { text: 'JavaScript', votes: [byUsername.get('aman_gupta')._id, byUsername.get('priya_verma')._id] },
        { text: 'C++', votes: [] },
      ],
      totalVotes: 5,
    },
    likeCount: 18,
    createdAt: daysAgo(0.5),
  });
  createdPosts.push(pollPost);

  await SavedPost.create({ user: byUsername.get('ayush')._id, post: createdPosts[3]._id });
  // Keep the denormalised counter in step with the row we just wrote, the same
  // way `likeCount` is seeded alongside `likedBy`. Without this the shipped demo
  // DB claims a post has zero saves while a bookmark exists for it, and the
  // next toggle decrements a `$gt: 0` guard that was never true.
  await Post.updateOne({ _id: createdPosts[3]._id }, { $inc: { saveCount: 1 } });

  console.log('📚 Creating notes...');
  await Note.create([
    { title: 'DBMS Unit 3 — Normalisation', subject: 'DBMS', course: 'MCA', semester: 2, description: '1NF through BCNF with worked examples and exam-style questions.', uploadedBy: byUsername.get('priya_verma')._id, downloadCount: 125, averageRating: 4.8, ratingCount: 25, file: { url: 'https://example.com/dbms-unit-3.pdf', name: 'DBMS_Unit_3.pdf', mimetype: 'application/pdf', size: 482_113 }, tags: ['dbms', 'normalisation'] },
    { title: 'Operating Systems — Deadlocks', subject: 'Operating System', course: 'MCA', semester: 3, description: 'Coffman conditions, prevention, avoidance and Banker algorithm.', uploadedBy: byUsername.get('rahul_sharma')._id, downloadCount: 87, averageRating: 4.5, ratingCount: 17, file: { url: 'https://example.com/os-deadlocks.pdf', name: 'OS_Deadlocks.pdf', mimetype: 'application/pdf', size: 391_002 }, tags: ['os', 'deadlock'] },
    { title: 'React Hooks — Complete Guide', subject: 'Web Development', course: 'MCA', semester: 2, description: 'useState, useEffect, useRef, useMemo and custom hooks with real examples.', uploadedBy: byUsername.get('ayush')._id, downloadCount: 214, averageRating: 4.9, ratingCount: 42, file: { url: 'https://example.com/react-hooks.pdf', name: 'React_Hooks.pdf', mimetype: 'application/pdf', size: 612_440 }, tags: ['react', 'hooks', 'frontend'] },
    { title: 'Computer Networks Unit 2', subject: 'Computer Networks', course: 'BCA', semester: 4, description: 'TCP/IP stack, routing and congestion control.', uploadedBy: byUsername.get('aman_gupta')._id, downloadCount: 63, averageRating: 4.2, ratingCount: 12, file: { url: 'https://example.com/cn-unit-2.pdf', name: 'CN_Unit_2.pdf', mimetype: 'application/pdf', size: 288_910 }, tags: ['networks', 'tcp-ip'] },
  ]);
  await User.updateOne({ _id: byUsername.get('priya_verma')._id }, { $inc: { notesCount: 1 } });
  await User.updateOne({ _id: byUsername.get('ayush')._id }, { $inc: { notesCount: 1 } });

  console.log('💬 Creating discussions...');
  await Discussion.create(
    discussions.map((d, i) => ({
      ...d,
      author: byUsername.get(students[i % students.length].username)._id,
      upvotes: d.upvotes,
      score: d.upvotes,
      votes: [],
    })),
  );

  console.log('📅 Creating events...');
  await Event.create(
    events.map((e) => ({
      ...e,
      startsAt: daysAhead(e.daysFromNow),
      endsAt: daysAhead(e.daysFromNow + 0.1),
      organizer: byUsername.get('ayush')._id,
      college: 'Invertis University',
      registrationCount: 40 + Math.floor(Math.random() * 120),
      capacity: 200,
    })),
  );

  console.log('🚩 Creating an open report for the admin queue...');
  await Report.create({
    reporter: byUsername.get('sneha_iyer')._id,
    targetType: 'post',
    targetId: createdPosts[0]._id,
    reason: 'spam',
    details: 'Possible duplicate of an earlier project post.',
    status: 'open',
  });

  console.log('🔔 Creating notifications...');
  // The demo account is `ayush`, so it gets a realistic inbox: follows,
  // reactions on their post, and a reply to their comment.
  const me = byUsername.get('ayush');
  const myPost = createdPosts.find((p) => String(p.author) === String(me._id));
  const followers = ['rahul_sharma', 'priya_verma', 'aman_gupta', 'vikram_singh', 'sneha_iyer'];

  await Notification.create([
    ...followers.slice(0, 3).map((username, i) => ({
      recipient: me._id,
      actor: byUsername.get(username)._id,
      type: 'follow',
      entity: { type: me._id, model: 'User' },
      text: 'started following you',
      // Two of the three stay unread so the badge has something to show.
      read: i > 1,
      createdAt: daysAgo(4 - i),
    })),
    {
      recipient: me._id,
      actor: byUsername.get('priya_verma')._id,
      type: 'like',
      entity: { type: myPost._id, model: 'Post' },
      text: 'liked your post',
      createdAt: daysAgo(2),
    },
    {
      recipient: me._id,
      actor: byUsername.get('rahul_sharma')._id,
      type: 'comment',
      entity: { type: myPost._id, model: 'Post' },
      text: 'commented on your post',
      createdAt: daysAgo(1.4),
    },
    {
      recipient: me._id,
      actor: byUsername.get('sneha_iyer')._id,
      type: 'reply',
      entity: { type: myPost._id, model: 'Post' },
      text: 'replied to your comment',
      createdAt: daysAgo(0.3),
    },
    {
      recipient: me._id,
      actor: byUsername.get('aman_gupta')._id,
      type: 'share',
      entity: { type: myPost._id, model: 'Post' },
      text: 'shared your post',
      read: true,
      createdAt: daysAgo(3),
    },
  ]);
  console.log(`   6 notifications for @${me.username}`);

  console.log('\n✅ Seed complete\n');
  console.log('   Sign in with any of these (password: %s)\n', PASSWORD);
  for (const s of students) {
    console.log(`   student  ${s.email.padEnd(24)} @${s.username}`);
  }
  console.log(`   admin    ${'admin@campus.test'.padEnd(24)} @admin  (admin dashboard access)\n`);

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch(async (err) => {
  console.error('❌ Seed failed:', err);
  await mongoose.connection.close();
  process.exit(1);
});

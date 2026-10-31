/**
 * Central navigation definition. The desktop sidebar, the mobile bottom bar
 * and the command palette all read from this list, so adding a destination
 * means editing one array.
 */
import {
  Home,
  Compass,
  Search,
  BookOpen,
  Users,
  MessageSquare,
  CalendarDays,
  Bookmark,
  User as UserIcon,
  Layers,
  Shield,
  PlusCircle,
} from 'lucide-react';

/**
 * `available: false` marks a module whose API lands in a later phase. The
 * entry still renders — pointing at a "coming soon" page — so navigation is
 * honest rather than silently missing.
 */
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true, available: true },
  { to: '/explore', label: 'Explore', icon: Compass, available: true },
  { to: '/students', label: 'Students', icon: Search, available: true },
  { to: '/notes', label: 'Notes', icon: BookOpen, available: true, phase: 3 },
  { to: '/groups', label: 'Groups', icon: Users, available: true, phase: 3 },
  { to: '/discussions', label: 'Discussions', icon: Layers, available: true, phase: 3 },
  { to: '/events', label: 'Events', icon: CalendarDays, available: true, phase: 5 },
  { to: '/messages', label: 'Messages', icon: MessageSquare, available: false, phase: 4 },
  { to: '/saved', label: 'Saved', icon: Bookmark, available: true },
];

/**
 * Bottom bar shows at most five destinations on small screens.
 *
 * Selected by `to` rather than by index: an earlier version used `NAV_ITEMS[7]`,
 * which silently pointed at the wrong page the moment an item was inserted.
 */
export const MOBILE_NAV = [
  { to: '/home', label: 'Home', icon: Home, end: true, available: true },
  { to: '/explore', label: 'Explore', icon: Compass, available: true },
  { to: '/create', label: 'Post', icon: PlusCircle, available: true, isAction: true },
  { to: '/saved', label: 'Saved', icon: Bookmark, available: true },
  { to: '/profile', label: 'Profile', icon: UserIcon, available: true },
];

export const profileNav = [
  { to: '/profile', label: 'Profile', icon: UserIcon, available: true },
  { to: '/students', label: 'Find students', icon: Search, available: true },
  { to: '/saved', label: 'Saved', icon: Bookmark, available: true },
  { to: '/admin', label: 'Admin', icon: Shield, available: false, phase: 6, adminOnly: true },
];

/** Subjects shown on the landing page and the notes filter. */
export const SUBJECTS = [
  'DBMS',
  'Operating System',
  'Java',
  'Web Development',
  'Computer Networks',
  'Artificial Intelligence',
  'Data Structures',
  'Software Engineering',
];

export const COURSES = ['MCA', 'BCA', 'B.Tech', 'BBA', 'B.Sc', 'M.Sc', 'B.Com', 'MA', 'MBA', 'Diploma', 'Other'];

import { BarChart3, BookOpenCheck, BriefcaseBusiness, CalendarCheck2, ClipboardCheck, FileCheck2, GaugeCircle, GraduationCap, KeyRound, LayoutDashboard, ListChecks, MessagesSquare, Mic, Briefcase, Radar, Settings2, ShieldCheck, Sparkles, Target, Users, Workflow, type LucideIcon } from 'lucide-react';
import type { Role } from './auth';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const officer: NavItem[] = [
  { href: '/officer', label: 'Overview', icon: LayoutDashboard },
  { href: '/officer/drives', label: 'Drives', icon: BriefcaseBusiness },
  { href: '/officer/students', label: 'Students', icon: GraduationCap },
  { href: '/officer/reports', label: 'Reports', icon: BarChart3 },
  { href: '/officer/jobs', label: 'Recalculation', icon: Workflow },
  { href: '/officer/recruiters', label: 'Recruiter access', icon: KeyRound },
];

export const NAV: Record<Exclude<Role, 'recruiter'>, NavItem[]> = {
  student: [
    { href: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/student/drives', label: 'Drives', icon: Target },
    { href: '/student/skills', label: 'My skills', icon: Radar },
    { href: '/student/roles', label: 'Target roles', icon: Briefcase },
    { href: '/student/evidence', label: 'Evidence', icon: FileCheck2 },
    { href: '/student/assessments', label: 'Assessments', icon: BookOpenCheck },
    { href: '/student/plan', label: 'Preparation plan', icon: CalendarCheck2 },
    { href: '/student/interview', label: 'Mock interview', icon: Mic },
    { href: '/student/assistant', label: 'AI assistant', icon: Sparkles },
    { href: '/student/profile', label: 'Profile', icon: GraduationCap },
  ],
  faculty: [
    { href: '/faculty', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/faculty/reviews', label: 'Review queue', icon: ClipboardCheck },
    { href: '/faculty/mentees', label: 'Mentees', icon: Users },
    { href: '/faculty/assessments', label: 'Assessments', icon: ListChecks },
    { href: '/faculty/interviews', label: 'Mock interviews', icon: MessagesSquare },
  ],
  placement_officer: officer,
  placement_head: [{ href: '/head', label: 'Leadership view', icon: GaugeCircle }, ...officer],
  admin: [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/skills', label: 'Skill taxonomy', icon: Radar },
    { href: '/admin/config', label: 'Scoring & settings', icon: Settings2 },
    { href: '/admin/access', label: 'Recruiter access log', icon: ShieldCheck },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  faculty: 'Faculty',
  placement_officer: 'Placement officer',
  placement_head: 'Placement head',
  recruiter: 'Recruiter',
  admin: 'Administrator',
};

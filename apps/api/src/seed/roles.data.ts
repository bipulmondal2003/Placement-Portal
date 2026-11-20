import { SD, DATA, QA } from './taxonomy.data';

/** [skill or cluster name, kind, required level 1..5, weight 1..10, mandatory?] */
export type RoleReq = [string, 'skill' | 'cluster', number, number, boolean?];
export interface RoleSeed {
  slug: string;
  title: string;
  family: string;
  summary: string;
  requirements: RoleReq[];
}

/** Common entry-level roles. Names must match taxonomy.data.ts exactly (seed fails loudly otherwise). */
export const ROLES: RoleSeed[] = [
  {
    slug: 'full-stack-web-developer',
    title: 'Full-Stack Web Developer',
    family: SD,
    summary: 'Builds both the user interface and the server side of web applications: UI, APIs, databases and deployment basics.',
    requirements: [
      ['JavaScript', 'skill', 4, 9, true], ['HTML & CSS', 'skill', 3, 5], ['Frontend Framework', 'cluster', 3, 8], ['Backend Framework', 'cluster', 3, 8],
      ['REST API Design', 'skill', 3, 6], ['Relational Database', 'cluster', 3, 5], ['NoSQL Database', 'cluster', 2, 3], ['Authentication & Security', 'skill', 2, 4],
      ['Git & GitHub', 'skill', 3, 4], ['Arrays & Strings', 'skill', 3, 4], ['Problem Solving', 'skill', 3, 5], ['Technical Communication', 'skill', 3, 3],
    ],
  },
  {
    slug: 'frontend-developer',
    title: 'Frontend Developer',
    family: SD,
    summary: 'Turns designs into fast, accessible, responsive interfaces using modern JavaScript frameworks.',
    requirements: [
      ['JavaScript', 'skill', 4, 9, true], ['HTML & CSS', 'skill', 4, 8, true], ['Frontend Framework', 'cluster', 3, 9], ['Responsive Design', 'skill', 3, 5],
      ['Web Accessibility', 'skill', 2, 3], ['TypeScript', 'skill', 2, 3], ['REST API Design', 'skill', 2, 3], ['Git & GitHub', 'skill', 3, 4],
      ['Problem Solving', 'skill', 3, 4], ['Technical Communication', 'skill', 3, 3],
    ],
  },
  {
    slug: 'backend-developer',
    title: 'Backend Developer',
    family: SD,
    summary: 'Designs and builds server-side services, APIs and data models that are secure and reliable.',
    requirements: [
      ['Backend Framework', 'cluster', 3, 9, true], ['REST API Design', 'skill', 4, 8], ['SQL', 'skill', 3, 8, true], ['Relational Database', 'cluster', 3, 6],
      ['Authentication & Security', 'skill', 3, 6], ['Object-Oriented Programming', 'skill', 3, 5], ['Containerisation', 'cluster', 2, 3], ['Git & GitHub', 'skill', 3, 4],
      ['Hashing', 'skill', 3, 4], ['Arrays & Strings', 'skill', 3, 4], ['Problem Solving', 'skill', 3, 5],
    ],
  },
  {
    slug: 'software-development-engineer',
    title: 'Software Development Engineer (DSA-focused)',
    family: SD,
    summary: 'Entry-level product-company SDE role: strong data structures and algorithms, object-oriented design and problem solving.',
    requirements: [
      ['Arrays & Strings', 'skill', 4, 8, true], ['Trees & Graphs', 'skill', 3, 7], ['Dynamic Programming', 'skill', 3, 6], ['Sorting & Searching', 'skill', 3, 6],
      ['Recursion & Backtracking', 'skill', 3, 5], ['Hashing', 'skill', 3, 5], ['Linked Lists', 'skill', 3, 5], ['Stacks & Queues', 'skill', 3, 5],
      ['Complexity Analysis', 'skill', 3, 6], ['Object-Oriented Programming', 'skill', 3, 6], ['SQL', 'skill', 2, 4], ['Problem Solving', 'skill', 4, 6],
      ['Logical Reasoning', 'skill', 3, 3], ['Quantitative Aptitude', 'skill', 3, 3], ['Interview Communication', 'skill', 3, 4], ['Git & GitHub', 'skill', 3, 3],
    ],
  },
  {
    slug: 'data-analyst',
    title: 'Data Analyst',
    family: DATA,
    summary: 'Turns raw data into insight: SQL, Python analysis, statistics and clear dashboards for stakeholders.',
    requirements: [
      ['SQL', 'skill', 4, 9, true], ['Python', 'skill', 3, 7, true], ['Pandas & NumPy', 'skill', 3, 7], ['Statistics', 'skill', 3, 7], ['Data Cleaning & ETL', 'skill', 3, 6],
      ['Data Visualization Tool', 'cluster', 3, 7], ['Database Design', 'skill', 2, 3], ['Quantitative Aptitude', 'skill', 3, 4], ['Logical Reasoning', 'skill', 3, 3],
      ['Technical Communication', 'skill', 3, 5], ['Problem Solving', 'skill', 3, 4],
    ],
  },
  {
    slug: 'machine-learning-engineer',
    title: 'Machine Learning Engineer (Entry)',
    family: DATA,
    summary: 'Builds and evaluates machine learning models with Python and standard ML libraries.',
    requirements: [
      ['Python', 'skill', 4, 9, true], ['Machine Learning Fundamentals', 'skill', 4, 9, true], ['Statistics', 'skill', 3, 7], ['Pandas & NumPy', 'skill', 3, 6],
      ['ML Framework', 'cluster', 3, 7], ['Data Cleaning & ETL', 'skill', 3, 4], ['Git & GitHub', 'skill', 3, 3], ['Problem Solving', 'skill', 3, 4], ['Technical Communication', 'skill', 3, 3],
    ],
  },
  {
    slug: 'qa-test-engineer',
    title: 'QA / Test Engineer',
    family: QA,
    summary: 'Plans and runs manual and automated tests so that software ships with confidence.',
    requirements: [
      ['Manual Testing', 'skill', 4, 8, true], ['Test Case Design', 'skill', 4, 8], ['Bug Reporting', 'skill', 3, 6], ['Test Automation Tool', 'cluster', 3, 8],
      ['API Testing', 'skill', 3, 7], ['SQL', 'skill', 2, 4], ['Agile & Scrum', 'skill', 3, 3], ['Git & GitHub', 'skill', 3, 3], ['Performance Testing', 'skill', 2, 3],
      ['Logical Reasoning', 'skill', 3, 3], ['Technical Communication', 'skill', 3, 4],
    ],
  },
];

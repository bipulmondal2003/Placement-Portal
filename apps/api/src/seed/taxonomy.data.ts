/**
 * Institutional skill taxonomy for three target roles: software-development, data, testing.
 * Synonyms are explicit (no fuzzy matching). Clusters enable requirements such as "Frontend Framework".
 */
export type Dim = 'technical' | 'aptitude' | 'communication';
export const SD = 'software-development';
export const DATA = 'data';
export const QA = 'testing';

export interface ClusterSeed {
  name: string;
  description: string;
  roles: string[];
}
export interface SkillSeed {
  name: string;
  category: string;
  description: string;
  dimension?: Dim;
  cluster?: string;
  roles: string[];
  synonyms?: string[];
}

export const CLUSTERS: ClusterSeed[] = [
  { name: 'Frontend Framework', description: 'Component-based UI frameworks', roles: [SD] },
  { name: 'Backend Framework', description: 'Server-side application frameworks', roles: [SD] },
  { name: 'Relational Database', description: 'SQL-based relational database systems', roles: [SD, DATA] },
  { name: 'NoSQL Database', description: 'Non-relational data stores', roles: [SD] },
  { name: 'Cloud Platform', description: 'Public cloud providers', roles: [SD] },
  { name: 'Containerisation', description: 'Container build and orchestration tooling', roles: [SD] },
  { name: 'Data Visualization Tool', description: 'Dashboarding and BI tools', roles: [DATA] },
  { name: 'ML Framework', description: 'Machine learning libraries', roles: [DATA] },
  { name: 'Test Automation Tool', description: 'UI and end-to-end automation frameworks', roles: [QA] },
];

const L = (s: string[]) => s;
export const SKILLS: SkillSeed[] = [
  // ---- Programming Languages
  { name: 'Python', category: 'Programming Languages', description: 'General-purpose scripting and application development', roles: [SD, DATA, QA], synonyms: L(['python3', 'py', 'python programming']) },
  { name: 'Java', category: 'Programming Languages', description: 'Object-oriented JVM language', roles: [SD, QA], synonyms: L(['core java', 'java se']) },
  { name: 'JavaScript', category: 'Programming Languages', description: 'Language of the web, client and server', roles: [SD, QA], synonyms: L(['js', 'ecmascript', 'es6']) },
  { name: 'TypeScript', category: 'Programming Languages', description: 'Typed superset of JavaScript', roles: [SD], synonyms: L(['ts']) },
  { name: 'C++', category: 'Programming Languages', description: 'Systems and competitive programming language', roles: [SD], synonyms: L(['cpp', 'c plus plus']) },
  { name: 'C', category: 'Programming Languages', description: 'Low-level procedural language', roles: [SD], synonyms: L(['c programming']) },
  { name: 'Go', category: 'Programming Languages', description: 'Compiled language for services and tooling', roles: [SD], synonyms: L(['golang']) },
  { name: 'SQL', category: 'Programming Languages', description: 'Querying and manipulating relational data', roles: [SD, DATA, QA], synonyms: L(['structured query language', 'sql queries']) },
  // ---- Data Structures & Algorithms
  { name: 'Arrays & Strings', category: 'Data Structures & Algorithms', description: 'Array and string manipulation, two pointers, sliding window', roles: [SD], synonyms: L(['arrays', 'strings', 'array problems']) },
  { name: 'Linked Lists', category: 'Data Structures & Algorithms', description: 'Singly/doubly linked list operations', roles: [SD], synonyms: L(['linked list']) },
  { name: 'Stacks & Queues', category: 'Data Structures & Algorithms', description: 'LIFO/FIFO structures and monotonic patterns', roles: [SD], synonyms: L(['stack', 'queue']) },
  { name: 'Trees & Graphs', category: 'Data Structures & Algorithms', description: 'Tree traversals, BST, graph search and shortest paths', roles: [SD], synonyms: L(['trees', 'graphs', 'bfs dfs', 'graph algorithms']) },
  { name: 'Sorting & Searching', category: 'Data Structures & Algorithms', description: 'Sorting algorithms and binary search variants', roles: [SD], synonyms: L(['sorting', 'searching', 'binary search']) },
  { name: 'Dynamic Programming', category: 'Data Structures & Algorithms', description: 'Overlapping subproblems and optimal substructure', roles: [SD], synonyms: L(['dp', 'memoization']) },
  { name: 'Recursion & Backtracking', category: 'Data Structures & Algorithms', description: 'Recursive decomposition and search with pruning', roles: [SD], synonyms: L(['recursion', 'backtracking']) },
  { name: 'Hashing', category: 'Data Structures & Algorithms', description: 'Hash tables, sets and maps for fast lookup', roles: [SD], synonyms: L(['hash maps', 'hash tables']) },
  { name: 'Complexity Analysis', category: 'Data Structures & Algorithms', description: 'Time and space complexity reasoning', roles: [SD], synonyms: L(['big o', 'time complexity', 'space complexity']) },
  // ---- Frontend
  { name: 'HTML & CSS', category: 'Frontend Development', description: 'Semantic markup and styling', roles: [SD], synonyms: L(['html', 'css', 'html5', 'css3']) },
  { name: 'React', category: 'Frontend Development', description: 'Component-based UI library', cluster: 'Frontend Framework', roles: [SD], synonyms: L(['reactjs', 'react.js']) },
  { name: 'Vue.js', category: 'Frontend Development', description: 'Progressive UI framework', cluster: 'Frontend Framework', roles: [SD], synonyms: L(['vue', 'vuejs']) },
  { name: 'Angular', category: 'Frontend Development', description: 'Opinionated TypeScript UI framework', cluster: 'Frontend Framework', roles: [SD], synonyms: L(['angularjs', 'angular2']) },
  { name: 'Next.js', category: 'Frontend Development', description: 'React meta-framework with SSR and routing', cluster: 'Frontend Framework', roles: [SD], synonyms: L(['nextjs', 'next']) },
  { name: 'Tailwind CSS', category: 'Frontend Development', description: 'Utility-first CSS framework', roles: [SD], synonyms: L(['tailwind']) },
  { name: 'Responsive Design', category: 'Frontend Development', description: 'Layouts that adapt across devices', roles: [SD], synonyms: L(['responsive web design', 'mobile first']) },
  { name: 'Web Accessibility', category: 'Frontend Development', description: 'Accessible, inclusive interfaces (WCAG)', roles: [SD, QA], synonyms: L(['a11y', 'accessibility', 'wcag']) },
  // ---- Backend
  { name: 'Node.js', category: 'Backend Development', description: 'JavaScript server runtime', cluster: 'Backend Framework', roles: [SD], synonyms: L(['node', 'nodejs']) },
  { name: 'Express.js', category: 'Backend Development', description: 'Minimal Node.js web framework', cluster: 'Backend Framework', roles: [SD], synonyms: L(['express', 'expressjs']) },
  { name: 'NestJS', category: 'Backend Development', description: 'Structured TypeScript backend framework', cluster: 'Backend Framework', roles: [SD], synonyms: L(['nest', 'nest.js']) },
  { name: 'Django', category: 'Backend Development', description: 'Batteries-included Python web framework', cluster: 'Backend Framework', roles: [SD], synonyms: L(['django rest framework', 'drf']) },
  { name: 'Spring Boot', category: 'Backend Development', description: 'Java application framework', cluster: 'Backend Framework', roles: [SD], synonyms: L(['spring', 'springboot']) },
  { name: 'REST API Design', category: 'Backend Development', description: 'Designing resource-oriented HTTP APIs', roles: [SD, QA], synonyms: L(['rest', 'restful api', 'rest apis', 'api design']) },
  { name: 'Authentication & Security', category: 'Backend Development', description: 'AuthN/AuthZ, sessions, JWT, OWASP basics', roles: [SD], synonyms: L(['auth', 'jwt', 'oauth', 'web security']) },
  { name: 'Microservices', category: 'Backend Development', description: 'Service decomposition and inter-service communication', roles: [SD], synonyms: L(['microservice architecture']) },
  // ---- Databases
  { name: 'PostgreSQL', category: 'Databases', description: 'Advanced open-source relational database', cluster: 'Relational Database', roles: [SD, DATA], synonyms: L(['postgres', 'psql']) },
  { name: 'MySQL', category: 'Databases', description: 'Popular relational database', cluster: 'Relational Database', roles: [SD, DATA, QA], synonyms: L(['mariadb']) },
  { name: 'MongoDB', category: 'Databases', description: 'Document database', cluster: 'NoSQL Database', roles: [SD], synonyms: L(['mongo', 'mongoose']) },
  { name: 'Redis', category: 'Databases', description: 'In-memory data store and cache', cluster: 'NoSQL Database', roles: [SD], synonyms: L(['redis cache']) },
  { name: 'Database Design', category: 'Databases', description: 'Schema design, normalisation, indexing', roles: [SD, DATA], synonyms: L(['normalization', 'schema design', 'dbms', 'er modelling']) },
  // ---- Cloud & DevOps
  { name: 'Git & GitHub', category: 'Cloud & DevOps', description: 'Version control, branching and pull requests', roles: [SD, DATA, QA], synonyms: L(['git', 'github', 'version control']) },
  { name: 'Docker', category: 'Cloud & DevOps', description: 'Containers and images', cluster: 'Containerisation', roles: [SD], synonyms: L(['containers', 'dockerfile']) },
  { name: 'Kubernetes', category: 'Cloud & DevOps', description: 'Container orchestration', cluster: 'Containerisation', roles: [SD], synonyms: L(['k8s']) },
  { name: 'CI/CD', category: 'Cloud & DevOps', description: 'Automated build, test and deploy pipelines', roles: [SD, QA], synonyms: L(['ci cd', 'github actions', 'jenkins', 'continuous integration']) },
  { name: 'AWS', category: 'Cloud & DevOps', description: 'Amazon Web Services fundamentals', cluster: 'Cloud Platform', roles: [SD], synonyms: L(['amazon web services', 'ec2', 's3']) },
  { name: 'Azure', category: 'Cloud & DevOps', description: 'Microsoft Azure fundamentals', cluster: 'Cloud Platform', roles: [SD], synonyms: L(['microsoft azure']) },
  { name: 'Google Cloud', category: 'Cloud & DevOps', description: 'Google Cloud Platform fundamentals', cluster: 'Cloud Platform', roles: [SD], synonyms: L(['gcp']) },
  { name: 'Linux', category: 'Cloud & DevOps', description: 'Linux command line and administration basics', roles: [SD, QA], synonyms: L(['linux commands', 'shell', 'bash']) },
  // ---- Software Engineering
  { name: 'Object-Oriented Programming', category: 'Software Engineering', description: 'Encapsulation, inheritance, polymorphism, SOLID', roles: [SD, QA], synonyms: L(['oop', 'oops', 'object oriented programming']) },
  { name: 'Design Patterns', category: 'Software Engineering', description: 'Common reusable design solutions', roles: [SD], synonyms: L(['gof patterns']) },
  { name: 'System Design', category: 'Software Engineering', description: 'Scalable architecture and trade-offs', roles: [SD], synonyms: L(['hld', 'high level design']) },
  { name: 'Agile & Scrum', category: 'Software Engineering', description: 'Iterative delivery practices', roles: [SD, QA, DATA], synonyms: L(['agile', 'scrum']) },
  { name: 'Clean Code & Code Review', category: 'Software Engineering', description: 'Readable, maintainable code and review practice', roles: [SD], synonyms: L(['clean code', 'code review']) },
  // ---- Aptitude & Communication
  { name: 'Quantitative Aptitude', category: 'Aptitude & Communication', description: 'Arithmetic, percentages, ratios, data interpretation', dimension: 'aptitude', roles: [SD, DATA, QA], synonyms: L(['quant', 'aptitude', 'numerical ability']) },
  { name: 'Logical Reasoning', category: 'Aptitude & Communication', description: 'Series, puzzles, deduction', dimension: 'aptitude', roles: [SD, DATA, QA], synonyms: L(['reasoning', 'analytical reasoning']) },
  { name: 'Problem Solving', category: 'Aptitude & Communication', description: 'Breaking down unfamiliar problems systematically', dimension: 'aptitude', roles: [SD, DATA, QA], synonyms: L(['analytical thinking']) },
  { name: 'Verbal Ability', category: 'Aptitude & Communication', description: 'Reading comprehension and grammar', dimension: 'communication', roles: [SD, DATA, QA], synonyms: L(['english', 'reading comprehension']) },
  { name: 'Technical Communication', category: 'Aptitude & Communication', description: 'Explaining technical ideas in writing and speech', dimension: 'communication', roles: [SD, DATA, QA], synonyms: L(['technical writing', 'documentation']) },
  { name: 'Interview Communication', category: 'Aptitude & Communication', description: 'Structured, confident interview answers', dimension: 'communication', roles: [SD, DATA, QA], synonyms: L(['interview skills', 'hr interview']) },
  // ---- Data & Analytics
  { name: 'Pandas & NumPy', category: 'Data & Analytics', description: 'Data manipulation with Python libraries', roles: [DATA], synonyms: L(['pandas', 'numpy', 'dataframes']) },
  { name: 'Statistics', category: 'Data & Analytics', description: 'Descriptive and inferential statistics', roles: [DATA], synonyms: L(['probability and statistics', 'hypothesis testing']) },
  { name: 'Machine Learning Fundamentals', category: 'Data & Analytics', description: 'Supervised/unsupervised learning concepts and evaluation', roles: [DATA], synonyms: L(['ml', 'machine learning']) },
  { name: 'scikit-learn', category: 'Data & Analytics', description: 'Classical ML library', cluster: 'ML Framework', roles: [DATA], synonyms: L(['sklearn']) },
  { name: 'TensorFlow', category: 'Data & Analytics', description: 'Deep learning framework', cluster: 'ML Framework', roles: [DATA], synonyms: L(['tf', 'keras']) },
  { name: 'PyTorch', category: 'Data & Analytics', description: 'Deep learning framework', cluster: 'ML Framework', roles: [DATA], synonyms: L(['torch']) },
  { name: 'Tableau', category: 'Data & Analytics', description: 'Business intelligence dashboards', cluster: 'Data Visualization Tool', roles: [DATA], synonyms: L(['tableau desktop']) },
  { name: 'Power BI', category: 'Data & Analytics', description: 'Microsoft BI dashboards', cluster: 'Data Visualization Tool', roles: [DATA], synonyms: L(['powerbi', 'dax']) },
  { name: 'Matplotlib & Seaborn', category: 'Data & Analytics', description: 'Python plotting libraries', cluster: 'Data Visualization Tool', roles: [DATA], synonyms: L(['matplotlib', 'seaborn']) },
  { name: 'Data Cleaning & ETL', category: 'Data & Analytics', description: 'Preparing and transforming raw data', roles: [DATA], synonyms: L(['etl', 'data wrangling', 'data cleaning']) },
  // ---- Testing & QA
  { name: 'Manual Testing', category: 'Testing & QA', description: 'Exploratory and scripted manual test execution', roles: [QA], synonyms: L(['functional testing', 'exploratory testing']) },
  { name: 'Test Case Design', category: 'Testing & QA', description: 'Equivalence partitioning, boundary analysis, coverage', roles: [QA], synonyms: L(['test design', 'test cases', 'boundary value analysis']) },
  { name: 'Selenium', category: 'Testing & QA', description: 'Browser automation framework', cluster: 'Test Automation Tool', roles: [QA], synonyms: L(['selenium webdriver']) },
  { name: 'Cypress', category: 'Testing & QA', description: 'JavaScript end-to-end testing', cluster: 'Test Automation Tool', roles: [QA], synonyms: L(['cypress.io']) },
  { name: 'Playwright', category: 'Testing & QA', description: 'Cross-browser automation', cluster: 'Test Automation Tool', roles: [QA], synonyms: L(['playwright test']) },
  { name: 'API Testing', category: 'Testing & QA', description: 'Validating HTTP APIs with Postman or code', roles: [QA], synonyms: L(['postman', 'rest assured', 'api automation']) },
  { name: 'Bug Reporting', category: 'Testing & QA', description: 'Clear, reproducible defect reports and triage', roles: [QA], synonyms: L(['defect reporting', 'jira', 'bug tracking']) },
  { name: 'Performance Testing', category: 'Testing & QA', description: 'Load and stress testing', roles: [QA], synonyms: L(['jmeter', 'load testing']) },
];

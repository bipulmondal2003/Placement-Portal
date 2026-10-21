export interface QSeed {
  skill: string; // skill NAME in the taxonomy
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export interface AssessmentSeed {
  title: string;
  description: string;
  durationMinutes: number;
  maxAttempts: number;
  questions: QSeed[];
}

const q = (skill: string, prompt: string, options: string[], correctIndex: number, explanation: string): QSeed => ({ skill, prompt, options, correctIndex, explanation });

export const ASSESSMENTS: AssessmentSeed[] = [
  {
    title: 'Data Structures & Algorithms Fundamentals',
    description: 'Core DSA concepts: arrays, trees and graphs, sorting and searching, and complexity.',
    durationMinutes: 30,
    maxAttempts: 3,
    questions: [
      q('Arrays & Strings', 'Which technique finds the longest substring without repeating characters in O(n)?', ['Nested loops over all substrings', 'Sliding window with a set/map', 'Sorting the string first', 'Recursion without memoisation'], 1, 'A sliding window with a hash set/map tracks the current window in a single pass.'),
      q('Arrays & Strings', 'Given a sorted array, which approach finds a pair summing to a target in O(n) time and O(1) space?', ['Hash map of seen values', 'Two pointers from both ends', 'Binary search for every element', 'Sort again then scan'], 1, 'Two pointers move inward based on the current sum, needing no extra storage.'),
      q('Arrays & Strings', 'What is the time complexity of reversing a string of length n in place?', ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 2, 'Each of the n/2 swaps is constant time, so O(n).'),
      q('Trees & Graphs', 'Which traversal of a binary search tree visits nodes in sorted order?', ['Pre-order', 'In-order', 'Post-order', 'Level-order'], 1, 'In-order (left, node, right) yields ascending keys in a BST.'),
      q('Trees & Graphs', 'Which algorithm finds shortest paths in an unweighted graph?', ['DFS', 'BFS', 'Kruskal', 'Topological sort'], 1, 'BFS explores in layers, so the first time it reaches a node is via a shortest path.'),
      q('Trees & Graphs', 'What data structure does an iterative DFS typically use?', ['Queue', 'Stack', 'Heap', 'Deque of sorted keys'], 1, 'DFS goes deep first, which a LIFO stack models.'),
      q('Sorting & Searching', 'What is the worst-case time complexity of binary search on n sorted elements?', ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'], 1, 'The search space halves each step.'),
      q('Sorting & Searching', 'Which sorting algorithm has O(n log n) worst-case time and is stable?', ['Quick sort', 'Merge sort', 'Heap sort', 'Selection sort'], 1, 'Merge sort is O(n log n) in all cases and stable; quick and heap sort are not stable.'),
      q('Sorting & Searching', 'Binary search requires which precondition?', ['Unique elements', 'Sorted data', 'Even length', 'Integers only'], 1, 'The halving logic only works when the data is ordered.'),
      q('Complexity Analysis', 'What is the time complexity of the nested loops: for i in 1..n { for j in 1..n { work() } }?', ['O(n)', 'O(n log n)', 'O(n^2)', 'O(2^n)'], 2, 'n iterations of an n-iteration loop gives n squared operations.'),
      q('Complexity Analysis', 'Which is the space complexity of recursive Fibonacci without memoisation (call stack depth)?', ['O(1)', 'O(n)', 'O(n^2)', 'O(2^n)'], 1, 'Maximum recursion depth is n, even though the time is exponential.'),
      q('Complexity Analysis', 'Which growth rate is fastest?', ['O(n log n)', 'O(n^2)', 'O(2^n)', 'O(n)'], 2, 'Exponential growth dominates polynomial growth.'),
    ],
  },
  {
    title: 'SQL & Database Design',
    description: 'Writing SQL queries and reasoning about schema design.',
    durationMinutes: 25,
    maxAttempts: 3,
    questions: [
      q('SQL', 'Which clause filters groups after aggregation?', ['WHERE', 'HAVING', 'GROUP BY', 'ORDER BY'], 1, 'HAVING applies conditions to aggregated groups; WHERE filters rows before grouping.'),
      q('SQL', 'Which JOIN returns all rows from the left table and matching rows from the right?', ['INNER JOIN', 'LEFT JOIN', 'CROSS JOIN', 'SELF JOIN'], 1, 'LEFT JOIN keeps unmatched left rows with NULLs for the right side.'),
      q('SQL', 'What does SELECT COUNT(*) return when the table is empty?', ['NULL', '0', 'An error', '1'], 1, 'COUNT(*) returns 0 for an empty table.'),
      q('SQL', 'Which keyword removes duplicate rows from a result?', ['UNIQUE', 'DISTINCT', 'SINGLE', 'DEDUP'], 1, 'SELECT DISTINCT removes duplicate result rows.'),
      q('Database Design', 'Which normal form removes partial dependencies on a composite key?', ['1NF', '2NF', '3NF', 'BCNF'], 1, '2NF requires non-key attributes to depend on the whole key.'),
      q('Database Design', 'What is the main purpose of a database index?', ['Reduce disk usage', 'Speed up lookups', 'Enforce foreign keys', 'Encrypt rows'], 1, 'Indexes trade write cost and space for faster reads.'),
      q('Database Design', 'A many-to-many relationship between students and courses is modelled with:', ['A foreign key in students', 'A junction (join) table', 'A single wide table', 'A view'], 1, 'A join table holds one row per student-course pair.'),
    ],
  },
  {
    title: 'Web Development Fundamentals',
    description: 'JavaScript, React and REST API essentials.',
    durationMinutes: 30,
    maxAttempts: 3,
    questions: [
      q('JavaScript', 'What does `typeof null` return in JavaScript?', ['"null"', '"object"', '"undefined"', '"number"'], 1, 'A long-standing quirk: typeof null is "object".'),
      q('JavaScript', 'Which method creates a new array with the results of calling a function on every element?', ['forEach', 'map', 'reduce', 'filter'], 1, 'map returns a new array of transformed values; forEach returns undefined.'),
      q('JavaScript', 'What is a closure?', ['A function bundled with its lexical scope', 'A syntax for private classes', 'A way to close the browser', 'A promise that resolved'], 0, 'Closures let inner functions access variables of their enclosing scope after it returns.'),
      q('React', 'Which hook runs side effects after render?', ['useMemo', 'useEffect', 'useRef', 'useReducer'], 1, 'useEffect is for effects such as fetching and subscriptions.'),
      q('React', 'Why do list items need a stable `key` prop?', ['For styling', 'To let React match items between renders', 'To enable event handlers', 'To prevent re-renders entirely'], 1, 'Keys let React reconcile list items efficiently and keep state attached correctly.'),
      q('React', 'Which statement about state in React is true?', ['State can be mutated directly', 'State updates should use the setter function', 'State is shared globally by default', 'State only works in class components'], 1, 'State must be updated via the setter so React can re-render.'),
      q('REST API Design', 'Which HTTP method is idempotent and typically used to replace a resource?', ['POST', 'PUT', 'PATCH only', 'CONNECT'], 1, 'PUT replaces a resource and repeating it has the same effect.'),
      q('REST API Design', 'Which status code means a resource was created?', ['200', '201', '204', '301'], 1, '201 Created is returned after a successful creation.'),
      q('REST API Design', 'Which is the best practice for versioning a public REST API?', ['Never change it', 'Include a version in the URL or header', 'Use random IDs', 'Change HTTP methods'], 1, 'Explicit versions let you evolve without breaking clients.'),
    ],
  },
  {
    title: 'Placement Aptitude Test',
    description: 'Quantitative and logical reasoning practice.',
    durationMinutes: 25,
    maxAttempts: 5,
    questions: [
      q('Quantitative Aptitude', 'A price rises from 200 to 250. What is the percentage increase?', ['20%', '25%', '30%', '50%'], 1, '(250 - 200) / 200 = 25%.'),
      q('Quantitative Aptitude', 'If 6 workers finish a job in 10 days, how many days do 15 workers need (same rate)?', ['2', '4', '6', '25'], 1, 'Work = 60 worker-days; 60 / 15 = 4 days.'),
      q('Quantitative Aptitude', 'The average of 5 numbers is 18. If one number, 10, is removed, what is the new average?', ['18', '20', '22', '16'], 1, 'Sum = 90; 90 - 10 = 80; 80 / 4 = 20.'),
      q('Quantitative Aptitude', 'A train 150 m long passes a pole in 10 s. Its speed in km/h is:', ['15', '54', '36', '90'], 1, '15 m/s x 3.6 = 54 km/h.'),
      q('Logical Reasoning', 'Find the next number: 2, 6, 12, 20, 30, ?', ['38', '40', '42', '44'], 2, 'Differences grow by 2: +4, +6, +8, +10, +12 gives 42.'),
      q('Logical Reasoning', 'All roses are flowers. Some flowers fade quickly. Which conclusion is certain?', ['All roses fade quickly', 'Some roses fade quickly', 'All roses are flowers', 'No roses fade quickly'], 2, 'Only "all roses are flowers" follows with certainty.'),
      q('Logical Reasoning', 'If CAT is coded as DBU, how is DOG coded?', ['EPH', 'EPG', 'FPH', 'DPH'], 0, 'Each letter shifts by +1: D→E, O→P, G→H.'),
      q('Logical Reasoning', 'A is taller than B, B is taller than C. Who is the shortest?', ['A', 'B', 'C', 'Cannot be determined'], 2, 'Ordering A > B > C makes C shortest.'),
    ],
  },
];

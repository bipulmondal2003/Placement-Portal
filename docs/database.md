# Database

MongoDB through Mongoose. Foreign keys use `SchemaTypes.ObjectId` so they cast and populate correctly.

| Collection (model) | Purpose | Notable fields and indexes |
|---|---|---|
| `users` | Every account, all six roles | email (unique), role, `tokenVersion`, active, department / company |
| `studentprofiles` | Academic record and portfolio | user, mentor, rollNumber, department, graduationYear, cgpa, backlogs, projects[], certifications[] · index (department, graduationYear) |
| `skills`, `skillclusters`, `skillsynonyms` | Taxonomy | skill: name, category, dimension, roles[]; cluster groups interchangeable skills; synonyms resolve "js" to JavaScript · text index |
| `evidenceitems` | A student's claim plus proof | type, skills[{skill, claimedLevel}], url, status (pending / verified / rejected), source (manual, assessment, mock interview, resume AI) · indexes (student, status, type), (status, createdAt) |
| `verifications` | Append-only review decisions | evidence, reviewer, decision, comment, awarded[{skill, claimedLevel, awardedLevel}] |
| `assessments`, `assessmentattempts` | Objective tests and attempts | questions (correct index stays server-side), maxAttempts, perSkill scores · index (student, assessment, submittedAt) |
| `mockinterviews` | Faculty-recorded interviews | ratings, skillLevels[], feedback |
| `placementdrives`, `driverequirements`, `eligibilityrules`, `registrations` | Drives and who registered | requirement: skill or cluster, requiredLevel 1-5, weight 1-10, mandatory · registration unique on (drive, student) |
| `skillprofiles` | Per-student derived skill state | declared, self-reported and **verified** level kept in separate fields, evidenceStrength, evidence counts |
| `readinesssnapshots` | History of computed scores | student, drive, score, dimensions, inputsHash, trigger, computedAt · indexes (student, drive, computedAt desc), (student, drive, inputsHash) |
| `gapanalyses` | Latest gaps per student and drive | unique (student, drive) |
| `preparationplans`, `preparationtasks` | Plans and day-by-day tasks | source (rule_based or ai), basedOnInputsHash, task status · index (student, date) |
| `recruiteraccessgrants`, `accesslogs` | Recruiter release control and trail | grant: recruiter, drive, releasedFields[], validFrom, expiresAt, maxResultsPerSearch, revokedAt · log: action, outcome, fieldsReleased, resultCount, ip |
| `auditlogs` | Administrative actions | actor, action, target, metadata |
| `batchjobs` | Batch recalculation progress | status (queued, active, completed, partial, failed), total / processed / failed / skippedUnchanged, errorLog · partial unique index on `dedupeKey` while queued or active |
| `systemconfigs` | One document of scoring settings | dimensionWeights, evidenceWeights, evidenceFloor, level thresholds, switches, `version` |

## Separation worth noticing

`skillprofiles` stores *declared*, *self-reported* and *verified* levels as separate fields. Only the verified level reaches the readiness engine. A resume-extracted claim is an `evidenceitem` with source `resume_ai` and status `pending` until a faculty member decides on it.

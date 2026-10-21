# Known limitations

- **Evidence is by URL only.** There are no file uploads; students link to repositories, certificates or demos. Reviewers rely on those links staying reachable.
- **No notifications.** No email, SMS or in-app alerts. Students see review outcomes when they open the Evidence page; faculty see the queue when they open theirs.
- **Academic data is self-entered.** CGPA, percentages and backlogs come from the student, with placement-cell override and an audit trail. There is no integration with a university records system, so eligibility is only as accurate as that data.
- **Assessments have no server-side timer.** The duration is guidance. Attempts are limited and results are server-scored, but the time limit is not enforced.
- **Recruiter result window.** Searches return at most 50 candidates and page offsets are capped at 100, by design (anti-scraping). Recruiters narrow with filters rather than paging through everyone.
- **Training effectiveness is observational.** The plan-completion and retake reports show associations, not causes, and say so on screen.
- **Single institution.** One taxonomy, one set of scoring weights. There is no multi-tenant separation.
- **Taxonomy covers three role families** (software development, data, testing). Other families need new skills and clusters through the admin screens.
- **Readiness freshness.** Scores update a few seconds after a change (debounce) or after a batch. Right after changing a drive's requirements or the scoring weights, run a batch recalculation.
- **Tests ran on FerretDB, Docker images were not built, and Gemini was not exercised live.** See `testing.md`.

# Recruiter data-release policy

Recruiters never see student data by default. Access is created by the placement cell, narrowly and temporarily.

## Controls (all enforced in the API)

| Control | Behaviour |
|---|---|
| **Separate identity** | Recruiters sign in at `/recruiter/login` and receive their own cookie (strict, 30 minutes). Student, faculty and staff sessions do not work on recruiter routes. |
| **Per-drive grant** | A grant ties one recruiter to one drive. Candidates are limited to students *registered* for that drive. |
| **Time-boxed** | Every grant has `validFrom` and `expiresAt`; the maximum span is 90 days. Expired and revoked grants stop working immediately. |
| **Field-level whitelist** | A grant lists the released fields. Every response passes through one projection function: a field is returned only if it is both on the hard-coded releasable list and on the grant. Anything else (student account id, mentor, backlogs, eligibility reasons, evidence, self-reported levels) cannot be released under any grant. |
| **Contact details** | `email` and `phone` can be released by the Placement Head only. |
| **Filters follow release** | A recruiter can filter only on fields released to them (otherwise filtering would let them infer hidden attributes). |
| **Opaque candidate ids** | Candidates are identified by the drive-scoped registration id, not the student's user id. |
| **No bulk export** | At most 50 results per search (grant-configurable lower), page offsets are capped, and there is no export endpoint. |
| **Logging** | Every drive list, search and candidate view, allowed or denied, is written to the access log with recruiter, drive, action, fields released, result count and IP. Officers and admins can read it; nobody can edit it. |
| **Rate limits** | Recruiter routes and login have their own, tighter limits. |

## Negative tests

The recruiter-privacy suite asserts, among others: a recruiter with no grant is denied; an expired or revoked grant is denied; a grant for drive A does not open drive B; unreleased fields are absent from list and detail responses; filters on unreleased fields are rejected; a student session cannot call recruiter routes; the officer (not head) cannot grant contact fields; grants longer than 90 days are rejected; each request produces a log entry.

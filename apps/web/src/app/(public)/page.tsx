import Link from 'next/link';
import { ArrowRight, BadgeCheck, Briefcase, FileCheck2, Mic, Scale, ShieldCheck, Target, Upload, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EvidenceBar, EvidenceLegend } from '@/components/evidence-bar';

const SAMPLE = [
  { skill: 'SQL', verified: 4, claimed: 4, required: 4, note: 'Passed the SQL assessment and a reviewed project' },
  { skill: 'Node.js', verified: 2, claimed: 4, required: 3, note: 'Claims level 4; a faculty-reviewed project supports level 2' },
  { skill: 'System design', verified: 0, claimed: 3, required: 3, note: 'Self-reported only, so it scores as a gap until someone verifies it' },
];
const FACTS = [
  ['7', 'target roles to match against'],
  ['4', 'readiness bands, from Getting started to Role ready'],
  ['3–8', 'question mock interviews, chat style'],
  ['2 MB', 'certificate upload (PDF, PNG, JPEG)'],
];
const STEPS = [
  { icon: UserRound, title: 'Build your profile', text: 'Add your skills, projects and CGPA details once.' },
  { icon: Target, title: 'Pick a target role', text: 'Choose from the role catalogue and see your match score.' },
  { icon: BadgeCheck, title: 'See your skill gaps', text: 'Matched, needs-improvement and missing skills, ranked by impact.' },
  { icon: Upload, title: 'Prove it', text: 'Take assessments, link projects, upload certificates for faculty review.' },
  { icon: Mic, title: 'Practise interviews', text: 'Chat-style mock interviews with feedback on every answer.' },
];
const ROLES = ['Full-Stack Web Developer', 'Frontend Developer', 'Backend Developer', 'Software Development Engineer', 'Data Analyst', 'Machine Learning Engineer (Entry)', 'QA / Test Engineer'];

export default function Landing() {
  return (
    <>
      <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-6 pt-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs font-medium"><span className="size-1.5 rounded-full bg-brand" aria-hidden />Student placement readiness platform</p>
          <h1 className="text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">Know exactly how <span className="brand-text">placement-ready</span> you are.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Choose a role, see which skills you can prove and which you are missing, then close the gaps with assessments, certificates and mock interviews. Scores come only from verified evidence.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" className="brand-gradient border-0 text-white hover:opacity-90"><Link href="/register">Get started <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/login">Student sign in</Link></Button>
          </div>
        </div>

        <figure className="glass rounded-2xl p-5" aria-labelledby="sample-cap">
          <figcaption id="sample-cap" className="mb-4 text-sm text-muted-foreground">An illustration of how one role reads a student’s skills. Not real student data.</figcaption>
          <ul className="space-y-5">
            {SAMPLE.map((s) => (
              <li key={s.skill}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="font-medium">{s.skill}</span>
                  <span className="tabular text-xs text-muted-foreground">verified {s.verified} · claimed {s.claimed} · needs {s.required}</span>
                </div>
                <EvidenceBar verified={s.verified} claimed={s.claimed} required={s.required} />
                <p className="mt-1.5 text-xs text-muted-foreground">{s.note}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t pt-3"><EvidenceLegend /></div>
        </figure>
      </section>

      <section aria-label="Platform at a glance" className="mx-auto mt-10 max-w-[1200px] px-4 sm:px-6">
        <dl className="glass grid grid-cols-2 gap-px overflow-hidden rounded-2xl lg:grid-cols-4">
          {FACTS.map(([n, l]) => (
            <div key={l} className="p-5 text-center sm:p-6">
              <dt className="brand-text text-3xl font-bold sm:text-4xl">{n}</dt>
              <dd className="mt-1 text-xs text-muted-foreground sm:text-sm">{l}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto mt-20 max-w-[1200px] px-4 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="text-2xl font-bold sm:text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="glass rounded-2xl p-5">
              <span className="brand-gradient grid size-10 place-items-center rounded-xl text-white"><s.icon className="size-5" aria-hidden /></span>
              <p className="mt-3 text-xs font-semibold text-brand">Step {i + 1}</p>
              <h3 className="mt-0.5 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-20 max-w-[1200px] px-4 sm:px-6" aria-labelledby="roles">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="roles" className="text-2xl font-bold sm:text-3xl">Roles you can aim for</h2>
          <Button asChild variant="ghost"><Link href="/register">See your match <ArrowRight /></Link></Button>
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <li key={r} className="glass flex items-center gap-3 rounded-xl p-4 text-sm font-medium"><Briefcase className="size-4 shrink-0 text-brand" aria-hidden />{r}</li>
          ))}
        </ul>
      </section>

      <section className="mx-auto mt-20 grid max-w-[1200px] gap-4 px-4 sm:px-6 md:grid-cols-3">
        {[
          { icon: Scale, t: 'Eligibility and readiness are separate', d: 'Eligibility is a yes or no from the drive’s rules. Readiness is a score for how well your verified skills fit. A low score never blocks you from applying.' },
          { icon: FileCheck2, t: 'Only verified evidence moves the score', d: 'Assessments are scored by the platform. Projects and certificates wait for your faculty mentor. A resume, an uploaded file or an AI suggestion never counts on its own.' },
          { icon: ShieldCheck, t: 'Recruiters see only what is released', d: 'Access is limited to one drive, a set of fields and a time window. Every view is logged, and there is no bulk export.' },
        ].map((c) => (
          <div key={c.t} className="glass rounded-2xl p-6">
            <c.icon className="mb-3 size-5 text-brand" aria-hidden />
            <h2 className="text-lg font-semibold">{c.t}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{c.d}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-20 max-w-[1200px] px-4 sm:px-6">
        <div className="brand-gradient rounded-3xl p-8 text-white sm:p-12">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready to see where you stand?</h2>
          <p className="mt-2 max-w-xl text-white/90">Create a student account, pick a role and get your first skill-gap report in minutes.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-white text-[hsl(224_64%_20%)] hover:bg-white/90"><Link href="/register">Create an account</Link></Button>
            <Button asChild size="lg" variant="outline" className="border-white/60 bg-transparent text-white hover:bg-white/15 hover:text-white"><Link href="/recruiter/login">Recruiter portal</Link></Button>
          </div>
        </div>
      </section>
    </>
  );
}

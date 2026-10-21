import Link from 'next/link';
import { ArrowRight, FileCheck2, Scale, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EvidenceBar, EvidenceLegend } from '@/components/evidence-bar';

const SAMPLE = [
  { skill: 'SQL', verified: 4, claimed: 4, required: 4, note: 'Passed the SQL assessment and a reviewed project' },
  { skill: 'Node.js', verified: 2, claimed: 4, required: 3, note: 'Claims level 4; a faculty-reviewed project supports level 2' },
  { skill: 'System design', verified: 0, claimed: 3, required: 3, note: 'Self-reported only, so it scores as a gap until someone verifies it' },
];

export default function Landing() {
  return (
    <>
      <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-4 pb-6 pt-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <h1 className="text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">Claiming a skill is easy. Showing it is what gets you placed.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Placement Skill Matcher compares what each drive asks for with what you can prove: assessments, reviewed projects and mock interviews. You get a readiness score, ranked skill gaps and a plan to close them.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link href="/register">Create a student account <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/login">Sign in</Link></Button>
          </div>
        </div>

        <figure className="rounded-lg border bg-card p-5" aria-labelledby="sample-cap">
          <figcaption id="sample-cap" className="mb-4 text-sm text-muted-foreground">An illustration of how one drive reads a student’s skills. Not real student data.</figcaption>
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

      <section className="mx-auto mt-20 grid max-w-[1200px] gap-10 px-4 sm:px-6 md:grid-cols-3">
        <div>
          <Scale className="mb-3 size-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">Eligibility and readiness are separate</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Eligibility is a yes or no from the drive’s rules: CGPA, department, backlogs. Readiness is a score for how well your verified skills fit. A low score never blocks you from applying.</p>
        </div>
        <div>
          <FileCheck2 className="mb-3 size-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">Only verified evidence moves the score</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Assessments are scored by the platform. Projects and certificates wait for your faculty mentor. A resume or an AI suggestion never counts as verified on its own.</p>
        </div>
        <div>
          <ShieldCheck className="mb-3 size-5 text-primary" aria-hidden />
          <h2 className="text-lg font-semibold">Recruiters see only what is released</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">Access is limited to one drive, a set of fields and a time window. Every view is logged, and there is no bulk export.</p>
        </div>
      </section>
    </>
  );
}

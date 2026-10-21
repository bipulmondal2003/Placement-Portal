'use client';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface Dimensions {
  technical?: number | null;
  aptitude?: number | null;
  communication?: number | null;
  projectDepth?: number | null;
}
const AXES: Array<[keyof Dimensions, string]> = [
  ['technical', 'Technical'],
  ['aptitude', 'Aptitude'],
  ['communication', 'Communication'],
  ['projectDepth', 'Project depth'],
];

/** Dimensions with no requirement in this drive come back as null; they are drawn at 0 and listed under the chart. */
export function ReadinessRadar({ dimensions, height = 260 }: { dimensions: Dimensions; height?: number }) {
  const data = AXES.map(([k, label]) => ({ axis: label, value: dimensions[k] ?? 0 }));
  const na = AXES.filter(([k]) => dimensions[k] === null || dimensions[k] === undefined).map(([, l]) => l);
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`Readiness by dimension: ${AXES.map(([k, l]) => `${l} ${dimensions[k] ?? 'not applicable'}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip formatter={(v: number) => [`${Math.round(v)} / 100`, 'Score']} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
            <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.22} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {na.length > 0 && <p className="mt-1 text-center text-xs text-muted-foreground">Not part of this drive: {na.join(', ')}</p>}
    </div>
  );
}

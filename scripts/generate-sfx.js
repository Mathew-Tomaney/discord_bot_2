// Synthesises a starter set of fantasy / sci-fi sound effects with ffmpeg's
// built-in signal generators, so the soundboard works out of the box with
// zero copyright worries. Drop your own clips in sounds/ for the good stuff.
//
// Usage: node scripts/generate-sfx.js [outDir]   (default: sounds-builtin)

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const outDir = process.argv[2] || 'sounds-builtin';
mkdirSync(outDir, { recursive: true });

// Each entry: inputs (lavfi graphs) + a filter_complex that combines them.
// All end in `[out]` and are rendered to 48kHz stereo WAV.
const SOUNDS = [
  {
    name: 'thunder',
    inputs: [
      'anoisesrc=color=white:seed=1:duration=0.35',
      'anoisesrc=color=brown:seed=2:duration=4.5',
    ],
    filter:
      '[0]highpass=f=1200,afade=t=out:st=0.05:d=0.3,volume=1.2[crack];' +
      '[1]lowpass=f=220,volume=9,afade=t=in:d=0.15,afade=t=out:st=1.4:d=3.1[rumble];' +
      '[crack][rumble]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9[out]',
  },
  {
    name: 'explosion',
    inputs: ['anoisesrc=color=white:seed=3:duration=0.5', 'anoisesrc=color=brown:seed=4:duration=3'],
    filter:
      '[0]lowpass=f=4000,afade=t=out:st=0.05:d=0.45,volume=1.4[blast];' +
      '[1]lowpass=f=350,volume=10,afade=t=in:d=0.02,afade=t=out:st=0.4:d=2.6[boom];' +
      '[blast][boom]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.9[out]',
  },
  {
    name: 'sword-clash',
    inputs: ['anoisesrc=color=white:seed=5:duration=0.9'],
    filter:
      '[0]asplit=3[a][b][c];' +
      '[a]bandpass=f=2600:width_type=q:w=12,bandpass=f=2600:width_type=q:w=12,volume=26[r1];' +
      '[b]bandpass=f=4100:width_type=q:w=12,bandpass=f=4100:width_type=q:w=12,volume=22[r2];' +
      '[c]highpass=f=3000,afade=t=out:st=0:d=0.06,volume=0.8[hit];' +
      '[r1][r2][hit]amix=inputs=3:duration=longest:normalize=0,afade=t=out:st=0.05:d=0.85,alimiter=limit=0.9[out]',
  },
  {
    name: 'laser',
    inputs: ["aevalsrc='0.55*sin(2*PI*(2600*t-2200*t*t))':d=0.45:s=48000"],
    filter: '[0]tremolo=f=45:d=0.5,afade=t=in:d=0.01,afade=t=out:st=0.28:d=0.17[out]',
  },
  {
    name: 'magic-sparkle',
    inputs: ["aevalsrc='0.22*sin(2*PI*1318*t)+0.18*sin(2*PI*1760*t)+0.14*sin(2*PI*2637*t)+0.10*sin(2*PI*3520*t)':d=1.1:s=48000"],
    filter: '[0]vibrato=f=9:d=0.6,afade=t=in:d=0.04,afade=t=out:st=0.45:d=0.65,apad=pad_dur=1.4,aecho=0.8:0.55:110|220|330:0.5|0.3|0.18[out]',
  },
  {
    name: 'heartbeat',
    inputs: [
      "aevalsrc='0.9*sin(2*PI*52*t)*exp(-mod(t,1.05)*16)+0.65*sin(2*PI*48*t)*exp(-mod(t+0.8,1.05)*16)':d=4.2:s=48000",
    ],
    filter: '[0]lowpass=f=140,afade=t=out:st=3.4:d=0.8[out]',
  },
  {
    name: 'alarm',
    inputs: ["aevalsrc='0.4*sin(2*PI*820*t+38*sin(2*PI*3.5*t))':d=2.4:s=48000"],
    filter: '[0]afade=t=in:d=0.03,afade=t=out:st=2.2:d=0.2[out]',
  },
  {
    name: 'wind',
    inputs: ['anoisesrc=color=pink:seed=6:duration=9'],
    filter: '[0]lowpass=f=650,volume=2.6,tremolo=f=0.35:d=0.7,afade=t=in:d=2.5,afade=t=out:st=6:d=3[out]',
  },
  {
    name: 'rain',
    inputs: ['anoisesrc=color=white:seed=8:duration=10'],
    filter: '[0]highpass=f=1500,lowpass=f=9000,volume=0.45,afade=t=in:d=1.5,afade=t=out:st=8:d=2[out]',
  },
  {
    name: 'drum-hit',
    inputs: ["aevalsrc='sin(2*PI*(58+130*exp(-t*28))*t)*exp(-t*5.5)':d=1.1:s=48000", 'anoisesrc=color=white:seed=9:duration=0.05'],
    filter: '[1]afade=t=out:st=0:d=0.05,volume=0.5[click];[0][click]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95[out]',
  },
  {
    name: 'crit-fanfare',
    inputs: [
      "aevalsrc='0.42*sin(2*PI*523.25*t)*between(t,0,0.16)+0.42*sin(2*PI*659.25*t)*between(t,0.16,0.32)+0.42*sin(2*PI*783.99*t)*between(t,0.32,0.48)+0.45*sin(2*PI*1046.5*t)*between(t,0.48,1.4)*exp(-(t-0.48)*2.2)':d=1.5:s=48000",
    ],
    filter: '[0]tremolo=f=6:d=0.15,apad=pad_dur=0.6,aecho=0.7:0.4:160:0.35[out]',
  },
  {
    name: 'fail-trombone',
    inputs: ["aevalsrc='0.45*sin(2*PI*(310*t-35*t*t))+0.15*sin(2*PI*(620*t-70*t*t))':d=1.6:s=48000"],
    filter: '[0]tremolo=f=7:d=0.5,afade=t=in:d=0.05,afade=t=out:st=1.1:d=0.5[out]',
  },
  {
    name: 'door-creak',
    inputs: ["aevalsrc='0.35*sin(2*PI*(180+60*sin(2*PI*1.3*t))*t)':d=1.8:s=48000", 'anoisesrc=color=pink:seed=10:duration=1.8'],
    filter:
      '[0]tremolo=f=28:d=0.8[tone];[1]bandpass=f=900:width_type=q:w=3,volume=0.4[grit];' +
      '[tone][grit]amix=inputs=2:duration=longest:normalize=0,afade=t=in:d=0.1,afade=t=out:st=1.3:d=0.5[out]',
  },
  {
    name: 'dice-roll',
    inputs: ['anoisesrc=color=white:seed=11:duration=1.2'],
    filter:
      "[0]bandpass=f=2200:width_type=q:w=2,volume=1.5,tremolo=f=22:d=1,volume='if(lt(t,0.9),1,0.4)':eval=frame,afade=t=out:st=0.7:d=0.5[out]",
  },
];

function render({ name, inputs, filter }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const graph of inputs) args.push('-f', 'lavfi', '-i', graph);
  args.push('-filter_complex', filter, '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', join(outDir, `${name}.wav`));
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpeg, args, { stdio: ['ignore', 'inherit', 'pipe'] });
    let err = '';
    ff.stderr.on('data', (d) => (err += d));
    ff.on('error', (e) => reject(e.code === 'ENOENT' ? new Error('ffmpeg not found on PATH') : e));
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${name}: ffmpeg exit ${code}\n${err}`))));
  });
}

let failed = 0;
for (const s of SOUNDS) {
  try {
    await render(s);
    console.log(`  ✓ ${s.name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${e.message}`);
  }
}
console.log(`Wrote ${SOUNDS.length - failed}/${SOUNDS.length} sounds to ${outDir}/`);
process.exit(failed ? 1 : 0);

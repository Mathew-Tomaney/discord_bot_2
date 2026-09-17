import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { FRAME_BYTES, Mixer } from '../src/player/Mixer.js';

process.env.DISCORD_TOKEN ??= 'test';

function pcm(frames, value) {
  const buf = Buffer.alloc(frames * FRAME_BYTES);
  for (let i = 0; i < buf.length; i += 2) buf.writeInt16LE(value, i);
  return buf;
}

function readFrame(mixer) {
  let chunk = mixer.read(FRAME_BYTES);
  assert.ok(chunk, 'mixer should always have a frame ready');
  return chunk;
}

test('outputs silence when nothing is loaded', () => {
  const mixer = new Mixer();
  const frame = readFrame(mixer);
  assert.equal(frame.length, FRAME_BYTES);
  assert.ok(frame.every((b) => b === 0));
});

test('plays music through with volume applied and emits musicEnd', async () => {
  const mixer = new Mixer({ musicVolume: 0.5 });
  const src = new PassThrough({ highWaterMark: 1 << 20 });
  src.end(pcm(3, 1000)); // 3 frames of a constant 1000
  await new Promise((r) => setImmediate(r));

  const ended = new Promise((r) => mixer.once('musicEnd', r));
  mixer.setMusic(src);

  // Drain any frames produced before the music was attached, then read until we see music.
  let got = 0;
  for (let i = 0; i < 20 && got < 3; i++) {
    const frame = readFrame(mixer);
    if (frame.readInt16LE(0) === 500) got++;
  }
  assert.equal(got, 3, 'all three music frames should come out at half volume');
  await ended;
  assert.equal(mixer.hasMusic, false);
});

test('sound effects are summed on top of music and duck it', async () => {
  const mixer = new Mixer({ musicVolume: 1, sfxVolume: 1 });
  const src = new PassThrough({ highWaterMark: 1 << 20 });
  src.write(pcm(200, 1000)); // long enough to still be playing
  await new Promise((r) => setImmediate(r));
  mixer.setMusic(src);
  // prime: get past the prebuffer check
  for (let i = 0; i < 4; i++) readFrame(mixer);

  const sfxEnd = new Promise((r) => mixer.once('sfxEnd', r));
  mixer.playSfx(pcm(2, 2000), { name: 'test' });
  const first = readFrame(mixer);
  const v = first.readInt16LE(0);
  // music is ducked from 1.0 toward 0.35 in steps, so 1000*duck + 2000 with duck < 1
  assert.ok(v > 2000 && v < 3000, `expected mixed sample, got ${v}`);
  readFrame(mixer);
  await sfxEnd;
  assert.deepEqual(mixer.activeSfx, []);
});

test('clipping is clamped to int16 range', () => {
  const mixer = new Mixer({ sfxVolume: 1 });
  mixer.playSfx(pcm(1, 30000));
  mixer.playSfx(pcm(1, 30000));
  // The first read may be a silence frame produced before the sfx were queued.
  let frame = readFrame(mixer);
  if (frame.readInt16LE(0) === 0) frame = readFrame(mixer);
  assert.equal(frame.readInt16LE(0), 32767);
});

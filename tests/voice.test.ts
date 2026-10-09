import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SILENCE_STOP_MS,
  joinTranscript,
  startDictation,
  type RecognitionLike,
  type VoiceTimers,
} from '../lib/voice';

class FakeRecognition implements RecognitionLike {
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: RecognitionLike['onresult'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onend: RecognitionLike['onend'] = null;
  started = false;
  stopped = false;
  /** The instance's cumulative result list, like a browser's event.results. */
  private segments: string[] = [];
  start() {
    this.started = true;
  }
  /** Browsers flush pending results and fire onend shortly after stop(). */
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  /** This event carries exactly these results (re-fired or revised segments). */
  speak(...phrases: string[]) {
    this.segments = [...phrases];
    this.fire();
  }
  /** New segments appended to the cumulative list (continuous dictation). */
  more(...phrases: string[]) {
    this.segments = [...this.segments, ...phrases];
    this.fire();
  }
  private fire() {
    const results = this.segments.map((transcript) => [{ transcript }]);
    this.onresult?.({ results });
  }
  /** The browser closes recognition on its own (no user stop). */
  end() {
    this.onend?.();
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
}
function harness(options: { silenceMs?: number; restartMs?: number } = {}) {
  const pending = new Map<number, { fn: () => void; at: number }>();
  let nextId = 1;
  const clock = {
    now: 0,
    advance(ms: number) {
      clock.now += ms;
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.at <= clock.now)
          .sort((a, b) => a[1].at - b[1].at);
        if (!due.length) return;
        for (const [id, t] of due) {
          pending.delete(id);
          t.fn();
        }
      }
    },
  };
  const timers: VoiceTimers = {
    set(fn, ms) {
      const id = nextId++;
      pending.set(id, { fn, at: clock.now + ms });
      return id;
    },
    clear(handle) {
      pending.delete(handle as number);
    },
  };
  const created: FakeRecognition[] = [];
  const texts: string[] = [];
  let ends = 0;
  const errors: string[] = [];
  const stop = startDictation(
    () => {
      const r = new FakeRecognition();
      created.push(r);
      return r;
    },
    (text) => texts.push(text),
    () => {
      ends += 1;
    },
    (message) => errors.push(message),
    { ...options, timers },
  );
  return {
    get current() {
      return created[created.length - 1];
    },
    created,
    texts,
    errors,
    endCount: () => ends,
    stop,
    clock,
  };
}

test('dictation keeps listening until the user stops, and stop is idempotent', () => {
  const h = harness();
  assert.equal(h.created.length, 1);
  assert.equal(h.current.interimResults, true);
  assert.equal(h.current.continuous, true);
  h.current.more('I ');
  h.clock.advance(4000);
  h.current.more('noticed ');
  h.clock.advance(4000); // results keep arriving: the silence window keeps resetting
  assert.equal(h.endCount(), 0);
  h.stop();
  assert.equal(h.current.stopped, true);
  assert.equal(h.endCount(), 1);
  h.stop();
  h.current.end();
  assert.equal(h.endCount(), 1);
  assert.deepEqual(h.texts.at(-1), 'I noticed');
});

test('five seconds of silence with no speech ends the session', () => {
  const h = harness();
  h.clock.advance(SILENCE_STOP_MS);
  assert.equal(h.endCount(), 1);
  assert.equal(h.current.stopped, true);
});

test('five seconds without new results ends the session after speech', () => {
  const h = harness();
  h.current.more('the light on the wall ');
  h.clock.advance(SILENCE_STOP_MS - 1);
  assert.equal(h.endCount(), 0);
  h.clock.advance(1);
  assert.equal(h.endCount(), 1);
  assert.deepEqual(h.texts.at(-1), 'the light on the wall');
});

test('re-fired and revised results replace the transcript instead of repeating it', () => {
  const h = harness();
  h.current.speak('I ');
  h.current.speak('I '); // browser re-fires an identical result event
  h.current.speak('I noticed '); // interim revised into a longer phrase
  h.current.speak('I noticed the light');
  assert.deepEqual(h.texts, ['I', 'I noticed', 'I noticed the light']);
  assert.ok(!h.texts.at(-1)!.includes('I noticed the light I noticed the light'));
});

test('cumulative segments build one transcript without repeats', () => {
  const h = harness();
  h.current.more('I saw ', 'a dog');
  h.current.more(' on the step');
  assert.deepEqual(h.texts, ['I saw a dog', 'I saw a dog on the step']);
});

test('browser restarts recognition on its own without duplicating committed text', () => {
  const h = harness({ restartMs: 250 });
  h.current.more('a bird ');
  h.current.end(); // browser closes the instance unexpectedly
  h.clock.advance(250);
  assert.equal(h.created.length, 2);
  assert.equal(h.endCount(), 0); // still listening
  h.current.more('on the wire');
  assert.deepEqual(h.texts.at(-1), 'a bird on the wire');
  assert.deepEqual(h.texts, ['a bird', 'a bird on the wire']);
  h.stop();
  assert.equal(h.endCount(), 1);
});

test('interim text from a restarted instance extends committed text once', () => {
  const h = harness({ restartMs: 250 });
  h.current.more('first ');
  h.current.end();
  h.clock.advance(250);
  h.current.more('second ');
  h.current.speak('second part'); // interim revised in the new instance
  assert.deepEqual(h.texts, ['first', 'first second', 'first second part']);
});

test('fatal errors surface one message and end the session without restarting', () => {
  const h = harness({ restartMs: 250 });
  h.current.fail('not-allowed');
  assert.deepEqual(h.errors, ['Microphone access was declined. Please type instead.']);
  h.clock.advance(1000);
  assert.equal(h.created.length, 1);
  assert.equal(h.endCount(), 1);
});

test('non-fatal no-speech restarts and silence still ends the session', () => {
  const h = harness({ restartMs: 250 });
  h.current.fail('no-speech');
  h.current.end();
  h.clock.advance(250);
  assert.equal(h.created.length, 2);
  h.clock.advance(SILENCE_STOP_MS);
  assert.equal(h.endCount(), 1);
});

test('joinTranscript spaces parts and enforces the length cap', () => {
  assert.equal(joinTranscript('hello  ', ' world '), 'hello world');
  assert.equal(joinTranscript('', 'only'), 'only');
  assert.equal(joinTranscript('a'.repeat(6000), 'b'.repeat(6000)).length, 5000);
});

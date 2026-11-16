import { canonicalDelimiter, DELIMITERS, findSeparator, splitCardLine } from './delimiters';

describe('findSeparator', () => {
  it.each([
    ['What is X >> Y', '>>', 'plain', 'forward', 'inline'],
    ['What is X == Y', '==', 'plain', 'forward', 'inline'],
    ['A << B', '<<', 'plain', 'backward', 'inline'],
    ['A <> B', '<>', 'plain', 'both', 'inline'],
    ['A >- B', '>-', 'plain', 'disabled', 'inline'],
    ['Conditions >>>', '>>>', 'plain', 'forward', 'set'],
    ['Steps >>1.', '>>1.', 'plain', 'forward', 'list'],
    ['Which? {CORRECT: A} >>A)', '>>A)', 'plain', 'forward', 'mc'],
    ['Semaphore :: counter', '::', 'concept', 'both', 'inline'],
    ['Term :> def', ':>', 'concept', 'forward', 'inline'],
    ['value ;; 1', ';;', 'descriptor', 'forward', 'inline'],
    ['value ;;< 1', ';;<', 'descriptor', 'both', 'inline'],
  ])('%s -> %s', (line, token, kind, direction, answerMode) => {
    const m = findSeparator(line);
    expect(m?.spec.token).toBe(token);
    expect(m?.spec.kind).toBe(kind);
    expect(m?.spec.direction).toBe(direction);
    expect(m?.spec.answerMode).toBe(answerMode);
  });

  it('only accepts multi-line tokens at the end of the line', () => {
    expect(findSeparator('a >>> b')?.spec.token).toBe('>>');
    expect(findSeparator('a >>1. b')?.spec.token).toBe('>>');
  });

  it('ignores delimiters inside protected regions and escapes', () => {
    expect(findSeparator('code `x == 0` here')).toBeNull();
    expect(findSeparator('math $a >> b$ here')).toBeNull();
    expect(findSeparator('a {{x::y}} b')).toBeNull();
    expect(findSeparator('see [[A::B]]')).toBeNull();
    expect(findSeparator('escaped \\>\\> here')).toBeNull();
    expect(findSeparator('link [x](http://a::b)')).toBeNull();
  });

  it('does not treat emoticons as disabled concepts', () => {
    expect(findSeparator('nice :-) right')).toBeNull();
    expect(findSeparator('Term :- def')?.spec.token).toBe(':-');
  });

  it('does not treat prices as LaTeX', () => {
    expect(findSeparator('costs $5 >> $10')?.spec.token).toBe('>>');
  });

  it('picks the first delimiter in the line', () => {
    expect(findSeparator('a :: b >> c')?.spec.token).toBe('::');
  });
});

describe('splitCardLine', () => {
  it('splits and trims', () => {
    expect(splitCardLine('  Q  >>  A ')).toMatchObject({ front: 'Q', back: 'A' });
    expect(splitCardLine('no card')).toEqual({ front: 'no card', back: null, spec: null });
  });
});

describe('canonicalDelimiter', () => {
  it('round-trips every spec to a token with the same semantics', () => {
    for (const spec of DELIMITERS) {
      const token = canonicalDelimiter(spec.kind, spec.direction, spec.answerMode)!;
      const back = DELIMITERS.find((s) => s.token === token)!;
      expect([back.kind, back.direction, back.answerMode]).toEqual([
        spec.kind,
        spec.direction,
        spec.answerMode,
      ]);
    }
    expect(canonicalDelimiter('plain', 'none', 'inline')).toBeNull();
  });
});

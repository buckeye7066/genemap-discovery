export const MAX_SEQUENCE_LENGTH = 600;
export const MAX_ALIGNMENT_LENGTH = 150;

const IUPAC_DNA = new Set('ACGTRYSWKMBDHVN'.split(''));
const COMPLEMENT = Object.freeze({
  A: 'T', C: 'G', G: 'C', T: 'A',
  R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K',
  B: 'V', D: 'H', H: 'D', V: 'B', N: 'N',
});

const CODON_TABLE = Object.freeze({
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
});

export class SequenceInputError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SequenceInputError';
    this.code = code;
  }
}

/** Normalize plain DNA or FASTA without silently discarding invalid symbols. */
export function normalizeDna(raw) {
  const body = String(raw ?? '')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('')
    .replace(/\s/g, '')
    .toUpperCase();
  const invalidSymbols = [...new Set([...body].filter((base) => !IUPAC_DNA.has(base)))];
  return {
    sequence: body,
    valid: body.length > 0 && invalidSymbols.length === 0,
    invalidSymbols,
  };
}

function requireDna(raw, maximum = MAX_SEQUENCE_LENGTH) {
  const fastaRecordCount = String(raw ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith('>'))
    .length;
  if (fastaRecordCount > 1) {
    throw new SequenceInputError(
      'Enter one FASTA record at a time; multiple records cannot be combined safely.',
      'multiple_fasta_records',
    );
  }
  const normalized = normalizeDna(raw);
  if (!normalized.sequence) {
    throw new SequenceInputError('Enter at least one DNA base.', 'empty_sequence');
  }
  if (normalized.invalidSymbols.length) {
    throw new SequenceInputError(
      `Unsupported DNA symbol${normalized.invalidSymbols.length > 1 ? 's' : ''}: ${normalized.invalidSymbols.join(', ')}`,
      'invalid_symbols',
    );
  }
  if (normalized.sequence.length > maximum) {
    throw new SequenceInputError(
      `Sequence is ${normalized.sequence.length} bases; this teaching tool is limited to ${maximum}.`,
      'sequence_too_long',
    );
  }
  return normalized.sequence;
}

export function reverseComplement(sequence) {
  const dna = requireDna(sequence);
  return [...dna].reverse().map((base) => COMPLEMENT[base]).join('');
}

export function transcribeDna(sequence) {
  return requireDna(sequence).replaceAll('T', 'U');
}

export function translateDna(sequence, frame = 0) {
  const dna = requireDna(sequence);
  if (![0, 1, 2].includes(frame)) {
    throw new SequenceInputError('Reading frame must be 0, 1, or 2.', 'invalid_frame');
  }
  const protein = [];
  for (let index = frame; index + 2 < dna.length; index += 3) {
    protein.push(CODON_TABLE[dna.slice(index, index + 3)] || 'X');
  }
  return protein.join('');
}

export function analyzeDna(raw, frame = 0) {
  const sequence = requireDna(raw);
  const gcBases = [...sequence].filter((base) => base === 'G' || base === 'C').length;
  return {
    sequence,
    length: sequence.length,
    gcPercent: Number(((gcBases / sequence.length) * 100).toFixed(1)),
    ambiguousBases: [...sequence].filter((base) => !'ACGT'.includes(base)).length,
    reverseComplement: reverseComplement(sequence),
    transcript: transcribeDna(sequence),
    protein: translateDna(sequence, frame),
    frame,
  };
}

/** Needleman-Wunsch global alignment for short teaching examples. */
export function globalAlign(firstRaw, secondRaw) {
  const first = requireDna(firstRaw, MAX_ALIGNMENT_LENGTH);
  const second = requireDna(secondRaw, MAX_ALIGNMENT_LENGTH);
  const rows = first.length + 1;
  const columns = second.length + 1;
  const scores = Array.from({ length: rows }, () => Array(columns).fill(0));
  const trace = Array.from({ length: rows }, () => Array(columns).fill(''));

  for (let row = 1; row < rows; row += 1) {
    scores[row][0] = row * -2;
    trace[row][0] = 'up';
  }
  for (let column = 1; column < columns; column += 1) {
    scores[0][column] = column * -2;
    trace[0][column] = 'left';
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const diagonal = scores[row - 1][column - 1]
        + (first[row - 1] === second[column - 1] ? 2 : -1);
      const up = scores[row - 1][column] - 2;
      const left = scores[row][column - 1] - 2;
      const best = Math.max(diagonal, up, left);
      scores[row][column] = best;
      trace[row][column] = best === diagonal ? 'diagonal' : best === up ? 'up' : 'left';
    }
  }

  let row = first.length;
  let column = second.length;
  const alignedFirst = [];
  const alignedSecond = [];
  while (row > 0 || column > 0) {
    const direction = trace[row][column];
    if (direction === 'diagonal') {
      alignedFirst.push(first[row - 1]);
      alignedSecond.push(second[column - 1]);
      row -= 1;
      column -= 1;
    } else if (direction === 'up') {
      alignedFirst.push(first[row - 1]);
      alignedSecond.push('-');
      row -= 1;
    } else {
      alignedFirst.push('-');
      alignedSecond.push(second[column - 1]);
      column -= 1;
    }
  }

  const top = alignedFirst.reverse().join('');
  const bottom = alignedSecond.reverse().join('');
  const comparison = [...top]
    .map((base, index) => base === bottom[index] ? '|' : base === '-' || bottom[index] === '-' ? ' ' : '.')
    .join('');
  return {
    first: top,
    comparison,
    second: bottom,
    score: scores[first.length][second.length],
    identityPercent: Number((([...comparison].filter((mark) => mark === '|').length / comparison.length) * 100).toFixed(1)),
  };
}

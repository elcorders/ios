import { describe, expect, it } from 'vitest';
import { buildRows, detectMapping, splitFullName } from './importMapping';

describe('detectMapping', () => {
  it('detects headers case-insensitively', () => {
    const m = detectMapping(['Student ID', 'E-mail', 'First Name', 'LAST NAME', 'Username', 'Mobile']);
    expect(m).toMatchObject({ index_no: 0, email: 1, first_name: 2, last_name: 3, lms_username: 4, phone: 5, full_name: -1 });
  });

  it('maps a full name column and index aliases', () => {
    const m = detectMapping(['Index No', 'Email', 'Full Name']);
    expect(m).toMatchObject({ index_no: 0, email: 1, full_name: 2, first_name: -1, last_name: -1 });
  });

  it('leaves unknown headers unmapped', () => {
    expect(detectMapping(['foo']).email).toBe(-1);
  });
});

describe('splitFullName', () => {
  it('uses the last word as last name', () => {
    expect(splitFullName('  Test  Middle Student ')).toEqual({ first_name: 'Test Middle', last_name: 'Student' });
    expect(splitFullName('Test')).toEqual({ first_name: 'Test', last_name: '' });
    expect(splitFullName('')).toEqual({ first_name: '', last_name: '' });
  });
});

describe('buildRows', () => {
  it('splits names, skips blank lines and keeps spreadsheet line numbers', () => {
    const mapping = detectMapping(['Email', 'Name', 'Phone']);
    const { rows, sourceLines } = buildRows(
      [['student070@example.edu', 'Test Student', ' 0712345678 '], ['', '', ''], ['student071@example.edu', 'Other Person', '']],
      mapping,
    );
    expect(rows).toEqual([
      { email: 'student070@example.edu', first_name: 'Test', last_name: 'Student', phone: '0712345678' },
      { email: 'student071@example.edu', first_name: 'Other', last_name: 'Person' },
    ]);
    expect(sourceLines).toEqual([2, 4]);
  });
});

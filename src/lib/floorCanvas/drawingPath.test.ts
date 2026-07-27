import { describe, expect, it } from 'vitest';
import { extractFloorDrawingPath } from '@/lib/floorCanvas/drawingPath';

describe('extractFloorDrawingPath', () => {
  it('returns raw path as-is', () => {
    expect(extractFloorDrawingPath('user/floor/1.png')).toBe('user/floor/1.png');
  });

  it('strips public URL prefix', () => {
    const url =
      'https://abc.supabase.co/storage/v1/object/public/floor-drawings/uid/fid/1.png';
    expect(extractFloorDrawingPath(url)).toBe('uid/fid/1.png');
  });

  it('strips signed URL query', () => {
    const url =
      'https://abc.supabase.co/storage/v1/object/sign/floor-drawings/uid/fid/1.png?token=xyz';
    expect(extractFloorDrawingPath(url)).toBe('uid/fid/1.png');
  });

  it('returns null for empty', () => {
    expect(extractFloorDrawingPath('')).toBeNull();
  });
});

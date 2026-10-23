import { applyDrag } from './RectEditor';

const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };

test('rect editor: move stays inside the area', () => {
	expect(applyDrag(start, 'move', 0.1, -0.1, 0)).toEqual({ x: 0.30000000000000004, y: 0.1, w: 0.4, h: 0.4 });
	expect(applyDrag(start, 'move', 1, 1, 0)).toEqual({ x: 0.6, y: 0.6, w: 0.4, h: 0.4 });
});

test('rect editor: resize from a corner keeps the opposite corner', () => {
	const r = applyDrag(start, 'nw', -0.1, -0.1, 0);
	expect(r.x).toBeCloseTo(0.1);
	expect(r.y).toBeCloseTo(0.1);
	expect(r.x + r.w).toBeCloseTo(0.6);
	expect(r.y + r.h).toBeCloseTo(0.6);
});

test('rect editor: resize keeps the ratio and the bounds', () => {
	let r = applyDrag(start, 'se', 0.2, 0, 2);
	expect(r.w / r.h).toBeCloseTo(2);

	r = applyDrag(start, 'se', 1, 1, 1);
	expect(r.x + r.w).toBeLessThanOrEqual(1);
	expect(r.y + r.h).toBeLessThanOrEqual(1);
	expect(r.w / r.h).toBeCloseTo(1);

	r = applyDrag(start, 'se', -1, -1, 0);
	expect(r.w).toBeCloseTo(0.02);
	expect(r.h).toBeCloseTo(0.02);
});

import { compactColumns } from './ChannelList';

test('channel list: one column while the channels fit, then two', () => {
	// a 1080p screen leaves about 890px for the panel; one tile is about 200px high
	expect(compactColumns(3, 2, 890)).toBe(1);
	expect(compactColumns(4, 1, 890)).toBe(1);
	expect(compactColumns(4, 2, 890)).toBe(2);
	expect(compactColumns(12, 4, 890)).toBe(2);
	expect(compactColumns(1, 1, 300)).toBe(1);
});

import * as L from './index';

test('layout: init clamps and rounds', () => {
	const layout = L.initLayout({
		source: 'abc',
		regions: [{ crop: { x: 0.9, y: -1, w: 0.5, h: 2 }, dst: { x: 2000, y: -5, w: 501, h: 3000 } }],
	});

	expect(layout.canvas.width).toBe(1080);
	expect(layout.canvas.height).toBe(1920);

	const r = layout.regions[0];
	expect(r.crop).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 });
	expect(r.dst).toEqual({ x: 580, y: 0, w: 500, h: 1920 });
});

test('layout: at most 4 regions', () => {
	const layout = L.initLayout({ regions: [{}, {}, {}, {}, {}, {}] });
	expect(layout.regions.length).toBe(L.MAX_REGIONS);
});

test('layout: empty graph without regions', () => {
	expect(L.buildFilterComplex({ source: 'abc' })).toBe('');
	expect(L.createInputsOutputs({ source: 'abc' })).toEqual([[], [], []]);
});

test('layout: one region graph', () => {
	const layout = L.presets.center({ source: 'abc' }, 1920, 1080);
	const r = layout.regions[0];

	expect(r.dst).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
	expect(r.crop.h).toBe(1);
	expect(r.crop.w).toBeCloseTo(0.3164, 3);

	const graph = L.buildFilterComplex(layout);
	expect(graph).toBe(
		'[0:v]fps=30,split=2[bgsrc][s0];' +
			'[bgsrc]scale=134:240:force_original_aspect_ratio=increase,crop=134:240,boxblur=8:2,scale=1080:1920,setsar=1[bg];' +
			`[s0]crop=w=iw*${r.crop.w}:h=ih*1:x=iw*${r.crop.x}:y=ih*0,scale=1080:1920,setsar=1[r0];` +
			'[bg][r0]overlay=x=0:y=0[comp];' +
			'[comp]format=yuv420p[vout]',
	);
});

test('layout: multiple regions are overlaid in order', () => {
	const layout = L.presets.split({ source: 'abc' }, 1920, 1080);
	layout.regions.push(L.initRegion({ crop: { x: 0, y: 0, w: 0.25, h: 0.25 }, dst: { x: 10, y: 20, w: 300, h: 300 } }));

	const graph = L.buildFilterComplex(layout);
	expect(graph).toContain('split=4[bgsrc][s0][s1][s2]');
	expect(graph).toContain('[bg][r0]overlay=x=0:y=640[o0]');
	expect(graph).toContain('[o0][r1]overlay=x=0:y=0[o1]');
	expect(graph).toContain('[o1][r2]overlay=x=10:y=20[comp]');
	expect(graph.endsWith('[comp]format=yuv420p[vout]')).toBe(true);
});

test('layout: color background', () => {
	const layout = L.presets.fit({ source: 'abc', canvas: { background: 'color', color: '#ff0000' } }, 1920, 1080);
	expect(layout.regions[0].dst).toEqual({ x: 0, y: 656, w: 1080, h: 608 });

	const graph = L.buildFilterComplex(layout);
	expect(graph).toContain('drawbox=x=0:y=0:w=iw:h=ih:color=0xFF0000:t=fill[bg]');

	layout.canvas.color = 'red;rm -rf';
	expect(L.buildFilterComplex(layout)).toContain('color=black:t=fill[bg]');
});

test('layout: process config', () => {
	const layout = L.presets.center({ source: 'abc', encoding: { audio: 'aac', bitrate: 4000 } }, 1920, 1080);

	let [global, inputs, outputs] = L.createInputsOutputs(layout, false);
	expect(global[0]).toBe('-filter_complex');
	expect(inputs).toEqual([{ address: '{memfs}/abc.m3u8', options: ['-re'] }]);
	expect(outputs[0].options.slice(0, 4)).toEqual(['-map', '[vout]', '-codec:v', 'h264_nvenc']);
	expect(outputs[0].options).toContain('4000k');
	expect(outputs[0].options.join(' ')).toContain('-map 0:a? -codec:a aac -b:a 160k');

	[, inputs] = L.createInputsOutputs(layout, true);
	expect(inputs).toEqual([{ address: '{rtmp,name=abc.stream}', options: [] }]);

	layout.encoding.encoder = 'libx264';
	layout.encoding.audio = 'none';
	[, , outputs] = L.createInputsOutputs(layout, true);
	expect(outputs[0].options).toContain('libx264');
	expect(outputs[0].options[outputs[0].options.length - 1]).toBe('-an');
});

test('layout: output streams', () => {
	const source = [
		{ type: 'video', codec: 'h264', width: 1280, height: 720 },
		{ type: 'audio', codec: 'aac', sampling_hz: 44100, layout: 'stereo', channels: 2 },
	];

	expect(L.getSourceSize(source)).toEqual([1280, 720]);
	expect(L.getSourceSize([])).toEqual([1920, 1080]);

	const streams = L.createOutputStreams({ source: 'abc' }, source);
	expect(streams.length).toBe(2);
	expect(streams[0]).toMatchObject({ type: 'video', codec: 'h264', width: 1080, height: 1920 });
	expect(streams[1]).toMatchObject({ type: 'audio', codec: 'aac', sampling_hz: 44100, stream: 1 });

	expect(L.createOutputStreams({ source: 'abc', encoding: { audio: 'none' } }, source).length).toBe(1);
});

test('layout: resize to aspect keeps one side and the center', () => {
	// wider: keep the height
	expect(L.resizeToAspect({ x: 100, y: 100, w: 200, h: 200 }, 2, 'h', 1080, 1920)).toEqual({ x: 0, y: 100, w: 400, h: 200 });
	// taller: keep the width
	expect(L.resizeToAspect({ x: 100, y: 100, w: 200, h: 200 }, 0.5, 'w', 1080, 1920)).toEqual({ x: 100, y: 0, w: 200, h: 400 });
	// too big for the bounds: shrink and keep the aspect
	const r = L.resizeToAspect({ x: 0, y: 0, w: 1000, h: 500 }, 4, 'h', 1920, 1080);
	expect(r.w).toBe(1920);
	expect(r.h).toBe(480);

	expect(L.keptSide({ w: 100, h: 100 }, { w: 150, h: 100 })).toBe('h');
	expect(L.keptSide({ w: 100, h: 100 }, { w: 100, h: 130 })).toBe('w');

	expect(L.initRegion({}).stretch).toBe(false);
	expect(L.initRegion({ stretch: true }).stretch).toBe(true);
});

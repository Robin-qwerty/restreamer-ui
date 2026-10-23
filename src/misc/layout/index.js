// Layouts describe a derived channel (e.g. a vertical 9:16 stream) that is composed
// from regions of another channel's live stream.
//
// Crop rectangles are stored as fractions (0..1) of the source frame, so a layout keeps
// working if the source resolution changes. Placement rectangles are stored in canvas pixels.

const MAX_REGIONS = 4;
const MIN_CROP = 0.02;
const MIN_DST = 16;

const defaultCanvas = {
	width: 1080,
	height: 1920,
	fps: 30,
	background: 'blur', // 'blur' or 'color'
	color: '#000000',
};

const defaultEncoding = {
	encoder: 'h264_nvenc', // 'h264_nvenc' or 'libx264'
	bitrate: 6000, // kbit/s
	audio: 'copy', // 'copy', 'aac' or 'none'
	audioBitrate: 160, // kbit/s
};

const even = (n) => {
	n = Math.round(n);
	return n % 2 === 0 ? n : n - 1;
};

const clamp = (n, min, max) => {
	if (Number.isNaN(n)) {
		return min;
	}

	return Math.min(Math.max(n, min), max);
};

const round4 = (n) => Math.round(n * 10000) / 10000;

const sanitizeColor = (color) => {
	if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) {
		return '0x' + color.substring(1).toUpperCase();
	}

	return 'black';
};

const initRegion = (region, canvas) => {
	if (!region) {
		region = {};
	}

	canvas = { ...defaultCanvas, ...canvas };

	const crop = {
		x: 0,
		y: 0,
		w: 1,
		h: 1,
		...region.crop,
	};

	crop.w = clamp(crop.w, MIN_CROP, 1);
	crop.h = clamp(crop.h, MIN_CROP, 1);
	crop.x = clamp(crop.x, 0, 1 - crop.w);
	crop.y = clamp(crop.y, 0, 1 - crop.h);

	const dst = {
		x: 0,
		y: 0,
		w: canvas.width,
		h: canvas.height,
		...region.dst,
	};

	dst.w = clamp(even(dst.w), MIN_DST, canvas.width);
	dst.h = clamp(even(dst.h), MIN_DST, canvas.height);
	dst.x = clamp(Math.round(dst.x), 0, canvas.width - dst.w);
	dst.y = clamp(Math.round(dst.y), 0, canvas.height - dst.h);

	return {
		id: region.id || 'r' + Math.random().toString(36).substring(2, 8),
		name: region.name || '',
		// keep the aspect ratio of the crop and the placement in sync while resizing
		lock: region.lock !== false,
		// unlocked only: let width and height of the placement change independently of the crop (distorts the picture)
		stretch: region.stretch === true,
		crop: {
			x: round4(crop.x),
			y: round4(crop.y),
			w: round4(crop.w),
			h: round4(crop.h),
		},
		dst: dst,
	};
};

const initLayout = (layout) => {
	if (!layout) {
		layout = {};
	}

	const canvas = {
		...defaultCanvas,
		...layout.canvas,
	};

	canvas.width = even(clamp(parseInt(canvas.width), 64, 4096));
	canvas.height = even(clamp(parseInt(canvas.height), 64, 4096));
	canvas.fps = clamp(parseInt(canvas.fps), 1, 60);

	let regions = Array.isArray(layout.regions) ? layout.regions : [];
	regions = regions.slice(0, MAX_REGIONS).map((r) => initRegion(r, canvas));

	return {
		version: 1,
		source: layout.source || '',
		canvas: canvas,
		encoding: {
			...defaultEncoding,
			...layout.encoding,
		},
		regions: regions,
	};
};

// Crop a 9:16 (canvas aspect) area from the center of the source and fill the canvas.
const presetCenter = (layout, srcWidth, srcHeight) => {
	layout = initLayout(layout);
	const { width, height } = layout.canvas;

	const srcAspect = srcWidth / srcHeight;
	const dstAspect = width / height;

	let w = 1;
	let h = 1;
	if (srcAspect > dstAspect) {
		w = dstAspect / srcAspect;
	} else {
		h = srcAspect / dstAspect;
	}

	layout.regions = [
		initRegion(
			{
				name: 'Main',
				crop: { x: (1 - w) / 2, y: (1 - h) / 2, w: w, h: h },
				dst: { x: 0, y: 0, w: width, h: height },
			},
			layout.canvas,
		),
	];

	return layout;
};

// Gameplay in the bottom 2/3, a facecam crop (top left of the source) in the top 1/3.
const presetSplit = (layout, srcWidth, srcHeight) => {
	layout = initLayout(layout);
	const { width, height } = layout.canvas;

	const top = even(height / 3);
	const bottom = height - top;

	const fit = (dstW, dstH, cx, cy, scale) => {
		// crop with the same aspect as the destination, centered at (cx, cy)
		let w = scale;
		let h = (w * srcWidth * dstH) / (dstW * srcHeight);
		if (h > 1) {
			w = w / h;
			h = 1;
		}

		return { x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - h / 2, 0, 1 - h), w: w, h: h };
	};

	layout.regions = [
		initRegion({ name: 'Gameplay', crop: fit(width, bottom, 0.5, 0.5, 0.6), dst: { x: 0, y: top, w: width, h: bottom } }, layout.canvas),
		initRegion({ name: 'Facecam', crop: fit(width, top, 0.15, 0.2, 0.3), dst: { x: 0, y: 0, w: width, h: top } }, layout.canvas),
	];

	return layout;
};

// The whole source frame, scaled to the canvas width and centered (letterbox).
const presetFit = (layout, srcWidth, srcHeight) => {
	layout = initLayout(layout);
	const { width, height } = layout.canvas;

	const h = Math.min(height, even((width * srcHeight) / srcWidth));

	layout.regions = [
		initRegion(
			{
				name: 'Full frame',
				crop: { x: 0, y: 0, w: 1, h: 1 },
				dst: { x: 0, y: (height - h) / 2, w: width, h: h },
			},
			layout.canvas,
		),
	];

	return layout;
};

// Give a rectangle (pixels) a new aspect ratio (w/h). keep is the side that stays the same ('w' or 'h'),
// the rectangle keeps its center and is shrunk if it does not fit into maxW x maxH.
const resizeToAspect = (rect, aspect, keep, maxW, maxH) => {
	let w = rect.w;
	let h = rect.h;

	if (keep === 'w') {
		h = w / aspect;
	} else {
		w = h * aspect;
	}

	if (w > maxW) {
		w = maxW;
		h = w / aspect;
	}

	if (h > maxH) {
		h = maxH;
		w = h * aspect;
	}

	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;

	return {
		x: clamp(cx - w / 2, 0, maxW - w),
		y: clamp(cy - h / 2, 0, maxH - h),
		w: w,
		h: h,
	};
};

// The side of a resized rectangle that changed the least (relative), i.e. the one the other box keeps.
const keptSide = (before, after) => {
	const dw = Math.abs(after.w - before.w) / before.w;
	const dh = Math.abs(after.h - before.h) / before.h;

	return dw > dh ? 'h' : 'w';
};

const presets = {
	center: presetCenter,
	split: presetSplit,
	fit: presetFit,
};

// Build the -filter_complex graph. Input 0 is the source stream, the result is labeled [vout].
const buildFilterComplex = (layout) => {
	layout = initLayout(layout);

	const { width, height, fps } = layout.canvas;
	const regions = layout.regions;

	if (regions.length === 0) {
		return '';
	}

	const parts = [];

	// The background is derived from the source itself, so its timestamps follow the
	// live input (a lavfi color source would start at 0 and not match the stream).
	const splits = ['[bgsrc]', ...regions.map((r, i) => `[s${i}]`)];
	parts.push(`[0:v]fps=${fps},split=${splits.length}${splits.join('')}`);

	if (layout.canvas.background === 'color') {
		parts.push(`[bgsrc]scale=${width}:${height}:flags=neighbor,setsar=1,drawbox=x=0:y=0:w=iw:h=ih:color=${sanitizeColor(layout.canvas.color)}:t=fill[bg]`);
	} else {
		parts.push(
			`[bgsrc]scale=${even(width / 8)}:${even(height / 8)}:force_original_aspect_ratio=increase,crop=${even(width / 8)}:${even(height / 8)},boxblur=8:2,scale=${width}:${height},setsar=1[bg]`,
		);
	}

	regions.forEach((r, i) => {
		const c = r.crop;
		parts.push(`[s${i}]crop=w=iw*${c.w}:h=ih*${c.h}:x=iw*${c.x}:y=ih*${c.y},scale=${r.dst.w}:${r.dst.h},setsar=1[r${i}]`);
	});

	let last = '[bg]';
	regions.forEach((r, i) => {
		const out = i === regions.length - 1 ? '[comp]' : `[o${i}]`;
		parts.push(`${last}[r${i}]overlay=x=${r.dst.x}:y=${r.dst.y}${out}`);
		last = out;
	});

	parts.push(`[comp]format=yuv420p[vout]`);

	return parts.join(';');
};

const createVideoEncoderOptions = (layout) => {
	layout = initLayout(layout);

	const { fps } = layout.canvas;
	const bitrate = parseInt(layout.encoding.bitrate) || defaultEncoding.bitrate;
	const gop = `${fps * 2}`;

	if (layout.encoding.encoder === 'libx264') {
		return [
			'-codec:v',
			'libx264',
			'-preset:v',
			'veryfast',
			'-tune:v',
			'zerolatency',
			'-profile:v',
			'high',
			'-b:v',
			`${bitrate}k`,
			'-maxrate:v',
			`${bitrate}k`,
			'-bufsize:v',
			`${bitrate * 2}k`,
			'-r',
			`${fps}`,
			'-g',
			gop,
			'-keyint_min',
			gop,
			'-sc_threshold',
			'0',
			'-pix_fmt',
			'yuv420p',
		];
	}

	return [
		'-codec:v',
		'h264_nvenc',
		'-preset:v',
		'p4',
		'-tune:v',
		'll',
		'-rc:v',
		'cbr',
		'-profile:v',
		'high',
		'-b:v',
		`${bitrate}k`,
		'-maxrate:v',
		`${bitrate}k`,
		'-bufsize:v',
		`${bitrate * 2}k`,
		'-r',
		`${fps}`,
		'-g',
		gop,
		'-bf:v',
		'0',
		'-pix_fmt',
		'yuv420p',
	];
};

const createAudioEncoderOptions = (layout) => {
	layout = initLayout(layout);

	switch (layout.encoding.audio) {
		case 'none':
			return ['-an'];
		case 'aac':
			return ['-map', '0:a?', '-codec:a', 'aac', '-b:a', `${parseInt(layout.encoding.audioBitrate) || 160}k`, '-ar', '48000', '-ac', '2'];
		default:
			return ['-map', '0:a?', '-codec:a', 'copy'];
	}
};

// Address of the source channel's internal stream, the same way egress processes read it.
const createSourceInput = (sourceChannelid, useRTMP) => {
	if (useRTMP) {
		return {
			address: `{rtmp,name=${sourceChannelid}.stream}`,
			options: [],
		};
	}

	return {
		address: `{memfs}/${sourceChannelid}.m3u8`,
		options: ['-re'],
	};
};

// Returns [global, inputs, outputs] in the format UpsertIngest expects.
const createInputsOutputs = (layout, useRTMP) => {
	layout = initLayout(layout);

	const graph = buildFilterComplex(layout);
	if (layout.source.length === 0 || graph.length === 0) {
		return [[], [], []];
	}

	const global = ['-filter_complex', graph];
	const inputs = [createSourceInput(layout.source, useRTMP)];
	const outputs = [
		{
			address: '',
			options: ['-map', '[vout]', ...createVideoEncoderOptions(layout), ...createAudioEncoderOptions(layout)],
		},
	];

	return [global, inputs, outputs];
};

// The streams the derived channel produces, for the channel metadata (used by publications).
const createOutputStreams = (layout, sourceStreams) => {
	layout = initLayout(layout);

	const streams = [
		{
			url: '',
			index: 0,
			stream: 0,
			type: 'video',
			codec: 'h264',
			width: layout.canvas.width,
			height: layout.canvas.height,
			pix_fmt: 'yuv420p',
			sampling_hz: 0,
			layout: '',
			channels: 0,
		},
	];

	if (layout.encoding.audio === 'none') {
		return streams;
	}

	const audio = (sourceStreams || []).find((s) => s.type === 'audio');
	if (!audio) {
		return streams;
	}

	streams.push({
		url: '',
		index: 0,
		stream: 1,
		type: 'audio',
		codec: layout.encoding.audio === 'aac' ? 'aac' : audio.codec,
		width: 0,
		height: 0,
		pix_fmt: '',
		sampling_hz: layout.encoding.audio === 'aac' ? 48000 : audio.sampling_hz,
		layout: layout.encoding.audio === 'aac' ? 'stereo' : audio.layout,
		channels: layout.encoding.audio === 'aac' ? 2 : audio.channels,
	});

	return streams;
};

// Resolution of the source channel, from its stored output streams.
const getSourceSize = (sourceStreams) => {
	const video = (sourceStreams || []).find((s) => s.type === 'video' && s.width > 0 && s.height > 0);
	if (!video) {
		return [1920, 1080];
	}

	return [video.width, video.height];
};

export {
	MAX_REGIONS,
	defaultCanvas,
	defaultEncoding,
	initLayout,
	initRegion,
	presets,
	resizeToAspect,
	keptSide,
	buildFilterComplex,
	createVideoEncoderOptions,
	createAudioEncoderOptions,
	createInputsOutputs,
	createOutputStreams,
	getSourceSize,
};

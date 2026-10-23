import React from 'react';

import makeStyles from '@mui/styles/makeStyles';

// An area with a fixed aspect ratio that contains movable and resizable rectangles.
// All rectangles use normalized coordinates (0..1) relative to the area.

const useStyles = makeStyles((theme) => ({
	root: {
		position: 'relative',
		width: '100%',
		backgroundColor: theme.palette.common.black,
		overflow: 'hidden',
		userSelect: 'none',
		touchAction: 'none',
	},
	background: {
		position: 'absolute',
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
		objectFit: 'fill',
		pointerEvents: 'none',
	},
	rect: {
		position: 'absolute',
		boxSizing: 'border-box',
		borderWidth: 2,
		borderStyle: 'solid',
		cursor: 'move',
	},
	label: {
		position: 'absolute',
		top: 0,
		left: 0,
		padding: '0 4px',
		fontSize: '.75rem',
		lineHeight: '1.2rem',
		color: theme.palette.common.black,
		whiteSpace: 'nowrap',
		pointerEvents: 'none',
	},
	handle: {
		position: 'absolute',
		width: 14,
		height: 14,
		boxSizing: 'border-box',
		border: `2px solid ${theme.palette.common.black}`,
	},
}));

const MIN_SIZE = 0.02;

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

// Apply a pointer movement (dx, dy in normalized units) to a rectangle.
// mode is 'move' or a corner ('nw', 'ne', 'sw', 'se'). ratio is the normalized w/h ratio to keep, or 0.
const applyDrag = (start, mode, dx, dy, ratio) => {
	if (mode === 'move') {
		return {
			...start,
			x: clamp(start.x + dx, 0, 1 - start.w),
			y: clamp(start.y + dy, 0, 1 - start.h),
		};
	}

	const west = mode.includes('w');
	const north = mode.includes('n');

	// the fixed corner
	const fx = west ? start.x + start.w : start.x;
	const fy = north ? start.y + start.h : start.y;

	// available space from the fixed corner
	const maxW = west ? fx : 1 - fx;
	const maxH = north ? fy : 1 - fy;

	let w = clamp(start.w + (west ? -dx : dx), MIN_SIZE, maxW);
	let h = clamp(start.h + (north ? -dy : dy), MIN_SIZE, maxH);

	if (ratio > 0) {
		// follow the dominant direction, then fit into the available space
		if (Math.abs(dx) >= Math.abs(dy)) {
			h = w / ratio;
		} else {
			w = h * ratio;
		}

		if (h > maxH) {
			h = maxH;
			w = h * ratio;
		}

		if (w > maxW) {
			w = maxW;
			h = w / ratio;
		}
	}

	return {
		x: west ? fx - w : fx,
		y: north ? fy - h : fy,
		w: w,
		h: h,
	};
};

export default function RectEditor(props) {
	const classes = useStyles();
	const root = React.useRef(null);
	const drag = React.useRef(null);

	const handlePointerDown = (rect, mode) => (event) => {
		event.preventDefault();
		event.stopPropagation();

		props.onSelect(rect.id);

		const bounds = root.current.getBoundingClientRect();

		drag.current = {
			id: rect.id,
			mode: mode,
			ratio: rect.ratio || 0,
			start: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
			px: event.clientX,
			py: event.clientY,
			width: bounds.width,
			height: bounds.height,
		};

		root.current.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event) => {
		const d = drag.current;
		if (d === null) {
			return;
		}

		const dx = (event.clientX - d.px) / d.width;
		const dy = (event.clientY - d.py) / d.height;

		props.onChange(d.id, applyDrag(d.start, d.mode, dx, dy, d.ratio));
	};

	const handlePointerUp = (event) => {
		if (drag.current === null) {
			return;
		}

		drag.current = null;

		if (root.current.hasPointerCapture(event.pointerId)) {
			root.current.releasePointerCapture(event.pointerId);
		}
	};

	return (
		<div
			ref={root}
			className={classes.root}
			style={{ paddingTop: `${100 / props.aspect}%` }}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			onPointerDown={() => props.onSelect('')}
		>
			{props.children && <div className={classes.background}>{props.children}</div>}
			{props.rects.map((rect) => {
				const selected = rect.id === props.selected;
				return (
					<div
						key={rect.id}
						className={classes.rect}
						style={{
							left: `${rect.x * 100}%`,
							top: `${rect.y * 100}%`,
							width: `${rect.w * 100}%`,
							height: `${rect.h * 100}%`,
							borderColor: rect.color,
							backgroundColor: props.fill ? `${rect.color}33` : 'transparent',
							// keep the drawing order (later regions on top), so regions inside a larger one stay clickable
							borderStyle: selected ? 'solid' : 'dashed',
						}}
						onPointerDown={handlePointerDown(rect, 'move')}
					>
						<span className={classes.label} style={{ backgroundColor: rect.color }}>
							{rect.label}
						</span>
						{selected &&
							['nw', 'ne', 'sw', 'se'].map((corner) => (
								<span
									key={corner}
									className={classes.handle}
									style={{
										backgroundColor: rect.color,
										zIndex: 10,
										cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
										top: corner.includes('n') ? -7 : 'auto',
										bottom: corner.includes('s') ? -7 : 'auto',
										left: corner.includes('w') ? -7 : 'auto',
										right: corner.includes('e') ? -7 : 'auto',
									}}
									onPointerDown={handlePointerDown(rect, corner)}
								/>
							))}
					</div>
				);
			})}
		</div>
	);
}

RectEditor.defaultProps = {
	aspect: 16 / 9,
	rects: [],
	selected: '',
	fill: false,
	onSelect: function (id) {},
	onChange: function (id, rect) {},
};

export { applyDrag };

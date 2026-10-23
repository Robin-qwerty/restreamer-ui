import React from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useLingui } from '@lingui/react';
import { Trans, t } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import Backdrop from '@mui/material/Backdrop';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import RefreshIcon from '@mui/icons-material/Refresh';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import * as L from '../../misc/layout';
import NotifyContext from '../../contexts/Notify';
import Paper from '../../misc/Paper';
import PaperFooter from '../../misc/PaperFooter';
import PaperHeader from '../../misc/PaperHeader';
import RectEditor from './RectEditor';
import Select from '../../misc/Select';

const useStyles = makeStyles((theme) => ({
	gridContainerL1: {
		marginBottom: '6em',
	},
	canvasPane: {
		maxWidth: 400,
		margin: '0 auto',
	},
	outputPane: {
		[theme.breakpoints.up('md')]: {
			position: 'sticky',
			top: 0,
			alignSelf: 'flex-start',
		},
	},
	preview: {
		width: '100%',
		height: '100%',
		display: 'block',
	},
	hint: {
		marginTop: '.5em',
	},
}));

const COLORS = ['#ff5252', '#40c4ff', '#ffd740', '#69f0ae'];

const regionColor = (layout, id) => {
	const index = layout.regions.findIndex((r) => r.id === id);
	return COLORS[index % COLORS.length];
};

// Draw a preview of the composed canvas from the source snapshot
function Preview(props) {
	const classes = useStyles();
	const canvas = React.useRef(null);

	React.useEffect(() => {
		const c = canvas.current;
		const img = props.image;
		if (!c) {
			return;
		}

		const ctx = c.getContext('2d');
		const { width } = props.layout.canvas;
		const scale = c.width / width;

		ctx.filter = 'none';
		ctx.fillStyle = props.layout.canvas.background === 'color' ? props.layout.canvas.color : '#000000';
		ctx.fillRect(0, 0, c.width, c.height);

		if (!img || !img.complete || img.naturalWidth === 0) {
			return;
		}

		const iw = img.naturalWidth;
		const ih = img.naturalHeight;

		if (props.layout.canvas.background !== 'color') {
			// cover the canvas with a blurred copy of the source
			const s = Math.max(c.width / iw, c.height / ih);
			ctx.filter = 'blur(6px)';
			ctx.drawImage(img, (c.width - iw * s) / 2, (c.height - ih * s) / 2, iw * s, ih * s);
			ctx.filter = 'none';
		}

		for (let r of props.layout.regions) {
			ctx.drawImage(img, r.crop.x * iw, r.crop.y * ih, r.crop.w * iw, r.crop.h * ih, r.dst.x * scale, r.dst.y * scale, r.dst.w * scale, r.dst.h * scale);
		}
	}, [props.layout, props.image, props.imageVersion]);

	return <canvas ref={canvas} className={classes.preview} width={270} height={Math.round((270 * props.layout.canvas.height) / props.layout.canvas.width)} />;
}

export default function Layout(props) {
	const classes = useStyles();
	const navigate = useNavigate();
	const { i18n } = useLingui();
	const notify = React.useContext(NotifyContext);
	const { channelid: _channelid } = useParams();
	const [searchParams] = useSearchParams();
	const image = React.useRef(null);
	const [$ready, setReady] = React.useState(false);
	const [$saving, setSaving] = React.useState(false);
	const [$metadata, setMetadata] = React.useState(null);
	const [$layout, setLayout] = React.useState(L.initLayout({}));
	const [$selected, setSelected] = React.useState('');
	const [$source, setSource] = React.useState({
		width: 1920,
		height: 1080,
		streams: [],
		rtmp: false,
	});
	const [$imageVersion, setImageVersion] = React.useState(0);
	const [$snapshotTime, setSnapshotTime] = React.useState(Date.now());

	React.useEffect(() => {
		(async () => {
			await load();
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const loadSource = async (sourceid) => {
		const config = props.restreamer.ConfigActive();
		const metadata = await props.restreamer.GetIngestMetadata(sourceid);
		const [width, height] = L.getSourceSize(metadata.streams);

		const source = {
			width: width,
			height: height,
			streams: metadata.streams,
			rtmp: metadata.control.rtmp.enable === true && config.source.network.rtmp.enabled === true,
		};

		setSource(source);
		setSnapshotTime(Date.now());

		return source;
	};

	const load = async () => {
		if (props.restreamer.SelectChannel(_channelid) !== _channelid) {
			navigate('/', { replace: true });
			return;
		}

		const metadata = await props.restreamer.GetIngestMetadata(_channelid);
		setMetadata(metadata);

		let layout = L.initLayout(metadata.layout || { source: searchParams.get('source') || '' });
		if (props.restreamer.GetChannel(layout.source) === null) {
			layout.source = '';
		}

		if (layout.source.length !== 0) {
			const source = await loadSource(layout.source);
			if (layout.regions.length === 0) {
				layout = L.presets.center(layout, source.width, source.height);
			}
		}

		setLayout(layout);
		if (layout.regions.length !== 0) {
			setSelected(layout.regions[0].id);
		}

		setReady(true);
	};

	const update = (layout) => {
		setLayout(L.initLayout(layout));
	};

	const updateRegion = (id, change) => {
		update({
			...$layout,
			regions: $layout.regions.map((r) => (r.id === id ? { ...r, ...change } : r)),
		});
	};

	const cropAspect = (region) => (region.crop.w * $source.width) / (region.crop.h * $source.height);
	const dstAspect = (region) => region.dst.w / region.dst.h;

	const handleSourceChange = async (event) => {
		const sourceid = event.target.value;
		const source = await loadSource(sourceid);
		const layout = L.presets.center({ ...$layout, source: sourceid }, source.width, source.height);
		update(layout);
		setSelected(layout.regions[0].id);
	};

	// The snapshot is the real frame size; prefer it over the stored stream info.
	const handleImageLoad = () => {
		const img = image.current;
		if (img && img.naturalWidth > 0 && (img.naturalWidth !== $source.width || img.naturalHeight !== $source.height)) {
			setSource({ ...$source, width: img.naturalWidth, height: img.naturalHeight });
		}

		setImageVersion($imageVersion + 1);
	};

	const handleCropChange = (id, rect) => {
		updateRegion(id, { crop: rect });
	};

	const handleDstChange = (id, rect) => {
		const { width, height } = $layout.canvas;
		updateRegion(id, { dst: { x: rect.x * width, y: rect.y * height, w: rect.w * width, h: rect.h * height } });
	};

	const handlePreset = (name) => () => {
		const layout = L.presets[name]($layout, $source.width, $source.height);
		update(layout);
		setSelected(layout.regions[0].id);
	};

	const handleAddRegion = () => {
		if ($layout.regions.length >= L.MAX_REGIONS) {
			return;
		}

		// a small picture-in-picture region from the center of the source
		const { width, height } = $layout.canvas;
		const w = width / 2;
		const h = (w * 9) / 16;
		const region = L.initRegion(
			{
				name: i18n._(t`Region ${$layout.regions.length + 1}`),
				crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
				dst: { x: (width - w) / 2, y: (height - h) / 2, w: w, h: h },
			},
			$layout.canvas,
		);

		update({ ...$layout, regions: [...$layout.regions, region] });
		setSelected(region.id);
	};

	const handleDuplicateRegion = (id) => () => {
		const region = $layout.regions.find((r) => r.id === id);
		if (!region || $layout.regions.length >= L.MAX_REGIONS) {
			return;
		}

		const copy = L.initRegion(
			{ ...region, id: '', name: region.name + ' 2', dst: { ...region.dst, x: region.dst.x + 40, y: region.dst.y + 40 } },
			$layout.canvas,
		);

		update({ ...$layout, regions: [...$layout.regions, copy] });
		setSelected(copy.id);
	};

	const handleDeleteRegion = (id) => () => {
		update({ ...$layout, regions: $layout.regions.filter((r) => r.id !== id) });
		setSelected('');
	};

	// Regions later in the list are drawn on top
	const handleMoveRegion = (id, direction) => () => {
		const regions = $layout.regions.slice();
		const index = regions.findIndex((r) => r.id === id);
		const target = index + direction;
		if (index === -1 || target < 0 || target >= regions.length) {
			return;
		}

		[regions[index], regions[target]] = [regions[target], regions[index]];
		update({ ...$layout, regions: regions });
	};

	const handleLockChange = (id) => (event) => {
		const region = $layout.regions.find((r) => r.id === id);
		const lock = event.target.checked;

		if (lock) {
			// match the placement to the crop, keeping its width
			updateRegion(id, { lock: true, dst: { ...region.dst, h: region.dst.w / cropAspect(region) } });
		} else {
			updateRegion(id, { lock: false });
		}
	};

	const handleNumber = (id, what, key, factor) => (event) => {
		const region = $layout.regions.find((r) => r.id === id);
		const value = parseFloat(event.target.value);
		if (Number.isNaN(value)) {
			return;
		}

		updateRegion(id, { [what]: { ...region[what], [key]: value / factor } });
	};

	const handleCanvas = (key) => (event) => {
		update({ ...$layout, canvas: { ...$layout.canvas, [key]: event.target.value } });
	};

	const handleEncoding = (key) => (event) => {
		update({ ...$layout, encoding: { ...$layout.encoding, [key]: event.target.value } });
	};

	const handleName = (event) => {
		setMetadata({ ...$metadata, meta: { ...$metadata.meta, name: event.target.value } });
	};

	const handleSave = async () => {
		setSaving(true);

		const save = async () => {
			const layout = L.initLayout($layout);
			const control = $metadata.control;

			const [global, inputs, outputs] = L.createInputsOutputs(layout, $source.rtmp);
			if (inputs.length === 0) {
				notify.Dispatch('error', 'save:layout', i18n._(t`Select a source channel and add at least one region.`));
				return false;
			}

			let [, err] = await props.restreamer.UpsertIngest(_channelid, global, inputs, outputs, control);
			if (err !== null) {
				notify.Dispatch('error', 'save:layout', i18n._(t`Failed to update ingest process (${err.message})`));
				return false;
			}

			const metadata = {
				...$metadata,
				sources: [],
				layout: layout,
				streams: L.createOutputStreams(layout, $source.streams),
			};

			if (metadata.meta.name.length === 0) {
				metadata.meta.name = i18n._(t`Vertical channel`);
			}

			let res = await props.restreamer.SetIngestMetadata(_channelid, metadata);
			if (res === false) {
				notify.Dispatch('warning', 'save:layout', i18n._(t`Failed to save ingest metadata`));
			}

			[, err] = await props.restreamer.UpsertIngestSnapshot(_channelid, control);
			if (err !== null) {
				notify.Dispatch('error', 'save:layout', i18n._(t`Failed to update ingest snapshot process (${err.message})`));
			}

			await props.restreamer.UpdatePlayer(_channelid);
			await props.restreamer.UpdatePlayersite();

			// make sure the composed stream runs right away
			await props.restreamer.StartIngest(_channelid);
			await props.restreamer.StartIngestSnapshot(_channelid);

			return true;
		};

		const res = await save();
		setSaving(false);

		if (res === false) {
			return;
		}

		notify.Dispatch('success', 'save:layout', i18n._(t`Layout saved`));
		navigate(`/pair/${$layout.source}/${_channelid}`);
	};

	const handleAbort = async () => {
		const channel = props.restreamer.GetChannel(_channelid);
		if (channel && channel.available === false) {
			// never saved, remove the empty channel again
			await props.restreamer.DeleteChannel(_channelid);
		}

		if ($layout.source.length !== 0) {
			props.restreamer.SelectChannel($layout.source);
			navigate(`/${$layout.source}`);
		} else {
			navigate('/');
		}
	};

	const handleDelete = async () => {
		if (!window.confirm(i18n._(t`Delete this channel and all its publications?`))) {
			return;
		}

		await props.restreamer.DeleteChannel(_channelid);

		if ($layout.source.length !== 0) {
			props.restreamer.SelectChannel($layout.source);
			navigate(`/${$layout.source}`);
		} else {
			navigate('/');
		}
	};

	if ($ready === false) {
		return (
			<Paper xs={8} sm={6} md={4} className="PaperM">
				<Grid container justifyContent="center" spacing={2} align="center">
					<Grid item xs={12}>
						<CircularProgress color="primary" />
					</Grid>
				</Grid>
			</Paper>
		);
	}

	const channel = props.restreamer.GetChannel(_channelid);
	const sources = props.restreamer.ListChannels().filter((c) => c.channelid !== _channelid);
	const selected = $layout.regions.find((r) => r.id === $selected) || null;
	const snapshot = $layout.source.length !== 0 ? props.restreamer.GetChannelAddress('snapshot+memfs', $layout.source) + '?t=' + $snapshotTime : '';
	const { width: CW, height: CH } = $layout.canvas;

	const cropRects = $layout.regions.map((r) => ({
		id: r.id,
		label: r.name,
		color: regionColor($layout, r.id),
		x: r.crop.x,
		y: r.crop.y,
		w: r.crop.w,
		h: r.crop.h,
		// in normalized source units, the w/h ratio that matches the placement
		ratio: r.lock ? (dstAspect(r) * $source.height) / $source.width : 0,
	}));

	const dstRects = $layout.regions.map((r) => ({
		id: r.id,
		label: r.name,
		color: regionColor($layout, r.id),
		x: r.dst.x / CW,
		y: r.dst.y / CH,
		w: r.dst.w / CW,
		h: r.dst.h / CH,
		ratio: r.lock ? (cropAspect(r) * CH) / CW : 0,
	}));

	return (
		<React.Fragment>
			<Grid container justifyContent="center" spacing={1} className={classes.gridContainerL1}>
				<Grid item xs={12}>
					<Paper marginBottom="0">
						<PaperHeader title={<Trans>Vertical layout</Trans>} onAbort={handleAbort} />
						<Grid container spacing={2}>
							<Grid item xs={12} md={6}>
								<TextField variant="outlined" fullWidth label={<Trans>Name</Trans>} value={$metadata.meta.name} onChange={handleName} />
							</Grid>
							<Grid item xs={12} md={6}>
								<Select label={<Trans>Source channel</Trans>} value={$layout.source} onChange={handleSourceChange}>
									{sources.map((c) => (
										<MenuItem key={c.channelid} value={c.channelid}>
											{c.name || c.channelid}
										</MenuItem>
									))}
								</Select>
							</Grid>
							{$layout.source.length !== 0 && (
								<React.Fragment>
									<Grid item xs={12} md={7}>
										<Grid container spacing={2}>
											<Grid item xs={12}>
												<Stack direction="row" justifyContent="space-between" alignItems="center">
													<Typography variant="h3">
														<Trans>Source</Trans> ({$source.width}x{$source.height})
													</Typography>
													<IconButton size="small" color="inherit" onClick={() => setSnapshotTime(Date.now())}>
														<RefreshIcon />
													</IconButton>
												</Stack>
												<RectEditor
													aspect={$source.width / $source.height}
													rects={cropRects}
													selected={$selected}
													onSelect={setSelected}
													onChange={handleCropChange}
													fill
												>
													<img ref={image} src={snapshot} alt="" onLoad={handleImageLoad} style={{ width: '100%', height: '100%' }} />
												</RectEditor>
												<Typography variant="body2" className={classes.hint}>
													<Trans>
														Drag the colored boxes to choose which part of the source each region shows. The picture is the channel
														snapshot, use the refresh button to update it.
													</Trans>
												</Typography>
												<Stack direction="row" spacing={1} marginTop="1em" flexWrap="wrap">
													<Button variant="outlined" color="default" size="small" onClick={handlePreset('center')}>
														<Trans>Center crop</Trans>
													</Button>
													<Button variant="outlined" color="default" size="small" onClick={handlePreset('split')}>
														<Trans>Facecam + gameplay</Trans>
													</Button>
													<Button variant="outlined" color="default" size="small" onClick={handlePreset('fit')}>
														<Trans>Full frame</Trans>
													</Button>
												</Stack>
											</Grid>
											<Grid item xs={12} md={6}>
												<Stack direction="row" justifyContent="space-between" alignItems="center">
													<Typography variant="h3">
														<Trans>Regions</Trans>
													</Typography>
													<IconButton
														size="small"
														color="inherit"
														onClick={handleAddRegion}
														disabled={$layout.regions.length >= L.MAX_REGIONS}
													>
														<AddIcon />
													</IconButton>
												</Stack>
												<List dense>
													{$layout.regions.map((r, i) => (
														<ListItemButton key={r.id} selected={r.id === $selected} onClick={() => setSelected(r.id)}>
															<ListItemText
																primary={r.name || i18n._(t`Region ${i + 1}`)}
																primaryTypographyProps={{ style: { color: regionColor($layout, r.id) } }}
															/>
															<IconButton size="small" onClick={handleMoveRegion(r.id, -1)} disabled={i === 0}>
																<ArrowUpwardIcon fontSize="small" />
															</IconButton>
															<IconButton
																size="small"
																onClick={handleMoveRegion(r.id, 1)}
																disabled={i === $layout.regions.length - 1}
															>
																<ArrowDownwardIcon fontSize="small" />
															</IconButton>
															<IconButton
																size="small"
																onClick={handleDuplicateRegion(r.id)}
																disabled={$layout.regions.length >= L.MAX_REGIONS}
															>
																<ContentCopyIcon fontSize="small" />
															</IconButton>
															<IconButton size="small" onClick={handleDeleteRegion(r.id)}>
																<DeleteIcon fontSize="small" />
															</IconButton>
														</ListItemButton>
													))}
												</List>
												<Typography variant="body2">
													<Trans>Regions lower in the list are drawn on top.</Trans>
												</Typography>
											</Grid>
											<Grid item xs={12} md={6}>
												{selected !== null && (
													<Grid container spacing={1}>
														<Grid item xs={12}>
															<TextField
																variant="outlined"
																size="small"
																fullWidth
																label={<Trans>Region name</Trans>}
																value={selected.name}
																onChange={(event) => updateRegion(selected.id, { name: event.target.value })}
															/>
														</Grid>
														<Grid item xs={12}>
															<FormControlLabel
																control={<Switch checked={selected.lock} onChange={handleLockChange(selected.id)} />}
																label={<Trans>Keep proportions</Trans>}
															/>
														</Grid>
														<Grid item xs={12}>
															<Typography variant="body2">
																<Trans>Position in output (px)</Trans>
															</Typography>
														</Grid>
														{['x', 'y', 'w', 'h'].map((key) => (
															<Grid item xs={6} key={'dst' + key}>
																<TextField
																	variant="outlined"
																	size="small"
																	type="number"
																	label={key}
																	value={selected.dst[key]}
																	onChange={handleNumber(selected.id, 'dst', key, 1)}
																/>
															</Grid>
														))}
														<Grid item xs={12}>
															<Typography variant="body2">
																<Trans>Crop from source (%)</Trans>
															</Typography>
														</Grid>
														{['x', 'y', 'w', 'h'].map((key) => (
															<Grid item xs={6} key={'crop' + key}>
																<TextField
																	variant="outlined"
																	size="small"
																	type="number"
																	label={key}
																	value={Math.round(selected.crop[key] * 1000) / 10}
																	onChange={handleNumber(selected.id, 'crop', key, 100)}
																/>
															</Grid>
														))}
													</Grid>
												)}
											</Grid>
											<Grid item xs={12}>
												<Grid container spacing={1}>
													<Grid item xs={6}>
														<Select
															label={<Trans>Background</Trans>}
															value={$layout.canvas.background}
															onChange={handleCanvas('background')}
														>
															<MenuItem value="blur">{i18n._(t`Blurred source`)}</MenuItem>
															<MenuItem value="color">{i18n._(t`Color`)}</MenuItem>
														</Select>
													</Grid>
													<Grid item xs={6}>
														{$layout.canvas.background === 'color' && (
															<TextField
																variant="outlined"
																fullWidth
																type="color"
																label={<Trans>Color</Trans>}
																value={$layout.canvas.color}
																onChange={handleCanvas('color')}
															/>
														)}
													</Grid>
													<Grid item xs={6}>
														<Select
															label={<Trans>Video encoder</Trans>}
															value={$layout.encoding.encoder}
															onChange={handleEncoding('encoder')}
														>
															<MenuItem value="h264_nvenc">NVIDIA NVENC (GPU)</MenuItem>
															<MenuItem value="libx264">x264 (CPU)</MenuItem>
														</Select>
													</Grid>
													<Grid item xs={6}>
														<Select label={<Trans>Framerate</Trans>} value={$layout.canvas.fps} onChange={handleCanvas('fps')}>
															<MenuItem value={25}>25</MenuItem>
															<MenuItem value={30}>30</MenuItem>
															<MenuItem value={50}>50</MenuItem>
															<MenuItem value={60}>60</MenuItem>
														</Select>
													</Grid>
													<Grid item xs={6}>
														<TextField
															variant="outlined"
															fullWidth
															type="number"
															label={<Trans>Video bitrate (kbit/s)</Trans>}
															value={$layout.encoding.bitrate}
															onChange={handleEncoding('bitrate')}
														/>
													</Grid>
													<Grid item xs={6}>
														<Select label={<Trans>Audio</Trans>} value={$layout.encoding.audio} onChange={handleEncoding('audio')}>
															<MenuItem value="copy">{i18n._(t`Passthrough`)}</MenuItem>
															<MenuItem value="aac">AAC</MenuItem>
															<MenuItem value="none">{i18n._(t`No audio`)}</MenuItem>
														</Select>
													</Grid>
													<Grid item xs={12}>
														<Typography variant="body2">
															{$source.rtmp ? (
																<Trans>Reads the source from the internal RTMP server (low delay).</Trans>
															) : (
																<Trans>
																	Reads the source from its HLS stream. Enable the RTMP server in the settings and in the
																	source channel for lower delay.
																</Trans>
															)}
														</Typography>
													</Grid>
												</Grid>
											</Grid>
										</Grid>
									</Grid>
									<Grid item xs={12} md={5} className={classes.outputPane}>
										<Typography variant="h3">
											<Trans>Output</Trans> ({CW}x{CH})
										</Typography>
										<div className={classes.canvasPane}>
											<RectEditor
												aspect={CW / CH}
												rects={dstRects}
												selected={$selected}
												onSelect={setSelected}
												onChange={handleDstChange}
											>
												<Preview layout={$layout} image={image.current} imageVersion={$imageVersion} />
											</RectEditor>
										</div>
									</Grid>
								</React.Fragment>
							)}
						</Grid>
						<Divider sx={{ marginTop: '1em' }} />
						<PaperFooter
							buttonsLeft={
								<React.Fragment>
									<Button variant="outlined" color="default" onClick={handleAbort}>
										<Trans>Close</Trans>
									</Button>
									{channel && channel.available && (
										<Button variant="outlined" color="secondary" onClick={handleDelete}>
											<Trans>Delete channel</Trans>
										</Button>
									)}
								</React.Fragment>
							}
							buttonsRight={
								<Button
									variant="outlined"
									color="primary"
									disabled={$saving || $layout.source.length === 0 || $layout.regions.length === 0}
									onClick={handleSave}
								>
									<Trans>Save</Trans>
								</Button>
							}
						/>
					</Paper>
				</Grid>
			</Grid>
			<Backdrop open={$saving}>
				<CircularProgress color="inherit" />
			</Backdrop>
		</React.Fragment>
	);
}

Layout.defaultProps = {
	restreamer: null,
};

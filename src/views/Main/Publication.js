import React from 'react';
import { useNavigate } from 'react-router-dom';

import { Trans } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import LensIcon from '@mui/icons-material/Lens';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import PersonIcon from '@mui/icons-material/Person';
import Typography from '@mui/material/Typography';

import useInterval from '../../hooks/useInterval';
import Egress from './Egress';
import H from '../../utils/help';
import Number from '../../misc/Number';
import Paper from '../../misc/Paper';
import PaperHeader from '../../misc/PaperHeader';
import Services from '../Publication/Services';

const useStyles = makeStyles((theme) => ({
	// viewers and bandwidth next to each other, around the middle
	statLeft: {
		paddingRight: '2em',
	},
	statRight: {
		paddingLeft: '2em!important',
	},
	channelLabel: {
		marginTop: '.6em',
		opacity: 0.85,
	},
	viewerCount: {
		fontSize: '3.5rem',
		fontWeight: 600,
	},
	vierwerDescription: {
		marginTop: '-1em',
	},
	vierwerTypo: {
		fontSize: '1.1rem',
	},
	bandwidth: {
		marginBottom: '.3em',
	},
	bandwidthCount: {
		fontSize: '2.5rem',
		fontWeight: 600,
	},
	bandwidthDescription: {
		marginTop: '-.5em',
	},
	bandwidthIcon: {
		fontSize: '1.7rem',
		paddingRight: 7,
	},
}));

export default function Publication(props) {
	const classes = useStyles();

	const navigate = useNavigate();
	const services = Services.IDs();
	const [$egresses, setEgresses] = React.useState([]);
	const [$addMenu, setAddMenu] = React.useState(null);

	// One channel (channelid) or several (channels: [{ channelid, label, color }]), e.g. on the dual view
	const channels = props.channels.length !== 0 ? props.channels : [{ channelid: props.channelid, label: '', color: '' }];
	const multiple = channels.length > 1;
	const [$session, setSession] = React.useState({
		viewer: 0,
		bandwidth: 0,
	});

	useInterval(async () => {
		await update();
	}, 1000);

	useInterval(async () => {
		await sessions();
	}, 1000);

	React.useEffect(() => {
		(async () => {
			await update();
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const update = async () => {
		const egresses = [];

		for (let c of channels) {
			const processes = await props.restreamer.ListIngestEgresses(c.channelid, services);

			for (let p of processes) {
				egresses.push({
					channelid: c.channelid,
					id: p.id,
					name: p.name,
					service: p.service,
					index: p.index,
					progress: p.progress,
				});
			}
		}

		setEgresses(egresses);
	};

	const sessions = async () => {
		const current = await props.restreamer.CurrentSessions(['ffmpeg', 'hls', 'rtmp', 'srt']);

		setSession({
			viewer: current.sessions,
			bandwidth: current.bitrate_kbit,
		});
	};

	const handleServiceAdd = (event) => {
		event.preventDefault();

		if (multiple) {
			// ask for which channel first
			setAddMenu(event.currentTarget);
			return;
		}

		navigate(`/${channels[0].channelid}/publication/`);
	};

	const handleServiceAddTo = (channelid) => () => {
		setAddMenu(null);
		props.restreamer.SelectChannel(channelid);
		navigate(`/${channelid}/publication/`);
	};

	const handleServiceEdit = (channelid, service, index) => () => {
		props.restreamer.SelectChannel(channelid);

		let target = `/${channelid}/publication/${service}`;

		if (service !== 'player') {
			target = target + '/' + index;
		}

		navigate(target);
	};

	const handleOrderChange = (channelid, id) => async (order) => {
		let res = false;

		if (order === 'start') {
			res = await props.restreamer.StartEgress(channelid, id);
		} else if (order === 'restart') {
			res = await props.restreamer.StopEgress(channelid, id);
			if (res === true) {
				res = await props.restreamer.StartEgress(channelid, id);
			}
		} else if (order === 'stop') {
			res = await props.restreamer.StopEgress(channelid, id);
		}

		return res;
	};

	const handleHelp = () => {
		H('publication');
	};

	let egresses = [];

	for (let c of channels) {
		const rows = [];

		if (multiple) {
			rows.push(
				<Grid item xs={12} key={'label:' + c.channelid} className={classes.channelLabel}>
					<Typography variant="body2" component="div">
						<LensIcon style={{ color: c.color, fontSize: '.8rem', marginRight: 6, verticalAlign: 'middle' }} />
						{c.label}
					</Typography>
				</Grid>,
			);
		}

		for (let e of $egresses.filter((x) => x.channelid === c.channelid)) {
			rows.push(
				<React.Fragment key={e.id}>
					<Grid item xs={12}>
						<Divider />
					</Grid>
					<Grid item xs={12}>
						<Egress
							service={e.service}
							name={e.name}
							state={e.progress.state}
							order={e.progress.order}
							reconnect={e.progress.reconnect !== -1}
							onEdit={handleServiceEdit(c.channelid, e.service, e.index)}
							onOrder={handleOrderChange(c.channelid, e.id)}
						/>
					</Grid>
				</React.Fragment>,
			);
		}

		if (multiple) {
			// the channels next to each other
			egresses.push(
				<Grid item xs={12} md={6} key={'channel:' + c.channelid}>
					<Grid container spacing={1}>
						{rows}
					</Grid>
				</Grid>,
			);
		} else {
			egresses.push(...rows);
		}
	}

	return (
		<React.Fragment>
			<Paper marginBottom="0">
				<PaperHeader title={<Trans>Publications</Trans>} onAdd={handleServiceAdd} onHelp={handleHelp} />
				<Grid container spacing={1}>
					<Grid item xs={12}>
						<Divider />
					</Grid>
					<Grid item xs={multiple ? 6 : 12} align={multiple ? 'right' : 'center'} className={multiple ? classes.statLeft : ''}>
						<Typography component="div" className={classes.viewerCount}>
							<Number value={$session.viewer} />
						</Typography>
						<Grid
							container
							direction="row"
							justifyContent={multiple ? 'flex-end' : 'center'}
							alignItems="center"
							className={classes.vierwerDescription}
						>
							<PersonIcon fontSize="small" />
							<Typography className={classes.vierwerTypo}>
								<Trans>Viewer</Trans>
							</Typography>
						</Grid>
					</Grid>
					<Grid item xs={multiple ? 6 : 12} align={multiple ? 'left' : 'center'} className={multiple ? classes.statRight : classes.bandwidth}>
						<Typography component="div" className={multiple ? classes.viewerCount : classes.bandwidthCount}>
							<Number value={$session.bandwidth} />
						</Typography>
						<Grid
							container
							direction="row"
							justifyContent={multiple ? 'flex-start' : 'center'}
							alignItems="center"
							className={multiple ? classes.vierwerDescription : classes.bandwidthDescription}
						>
							<CloudUploadIcon className={classes.bandwidthIcon} />
							<Typography>
								<Trans>kbit/s</Trans>
							</Typography>
						</Grid>
					</Grid>
					{egresses}
				</Grid>
			</Paper>
			<Menu anchorEl={$addMenu} open={$addMenu !== null} onClose={() => setAddMenu(null)} disableScrollLock>
				<MenuItem disabled>
					<Trans>Add a publication to</Trans>
				</MenuItem>
				{channels.map((c) => (
					<MenuItem key={c.channelid} onClick={handleServiceAddTo(c.channelid)}>
						<LensIcon style={{ color: c.color, fontSize: '.8rem', marginRight: 8 }} />
						{c.label}
					</MenuItem>
				))}
			</Menu>
		</React.Fragment>
	);
}

Publication.defaultProps = {
	channelid: '',
	channels: [],
	restreamer: null,
};

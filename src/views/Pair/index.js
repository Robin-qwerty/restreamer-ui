import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Trans } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import Grid from '@mui/material/Grid';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import ActivityPanel from '../Main/ActivityPanel';
import ChannelPanel from '../Main/ChannelPanel';
import Paper from '../../misc/Paper';
import Publication from '../Main/Publication';

const useStyles = makeStyles((theme) => ({
	gridContainerL1: {
		marginBottom: '6em',
		// lets the vertical player size itself relative to the column width (cqw)
		containerType: 'inline-size',
	},
}));

// Two channels side by side (e.g. a horizontal channel and the vertical channel composed from it),
// each with its own player, stats and publications.
export default function Pair(props) {
	const classes = useStyles();
	const navigate = useNavigate();
	const { a: _a, b: _b } = useParams();
	const theme = useTheme();
	const twoColumns = useMediaQuery(theme.breakpoints.up('md'));

	// Side by side, a vertical player is about 1.3x as high as a 16:9 player in the other column
	// (column = 50cqw, minus the paddings of the panel), so both look about the same size.
	const verticalPlayerHeight = twoColumns ? 'min(75vh, calc((50cqw - 66px) * 0.5625 * 1.3))' : 'min(70vh, 746px)';

	React.useEffect(() => {
		if (props.restreamer.GetChannel(_a) === null || props.restreamer.GetChannel(_b) === null) {
			navigate('/', { replace: true });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [_a, _b]);

	const handleEdit = (channelid) => (metadata) => {
		props.restreamer.SelectChannel(channelid);

		if (metadata.layout) {
			navigate(`/${channelid}/layout`);
		} else {
			navigate(`/${channelid}/edit`);
		}
	};

	const unconfigured = (
		<Paper>
			<Typography>
				<Trans>This channel is not configured yet.</Trans>
			</Typography>
		</Paper>
	);

	const column = (channelid) => (
		<Grid item xs={12} md={6} key={channelid}>
			<ChannelPanel
				restreamer={props.restreamer}
				channelid={channelid}
				unconfigured={unconfigured}
				onEdit={handleEdit(channelid)}
				onInvalid={() => navigate('/', { replace: true })}
				verticalPlayerHeight={verticalPlayerHeight}
			/>
			<Publication restreamer={props.restreamer} channelid={channelid} />
		</Grid>
	);

	const label = (channelid) => {
		const channel = props.restreamer.GetChannel(channelid);
		return channel && channel.name ? channel.name : channelid;
	};

	return (
		<Grid container justifyContent="center" spacing={1} className={classes.gridContainerL1}>
			<ActivityPanel
				key={`${_a}/${_b}`}
				restreamer={props.restreamer}
				channels={[
					{ channelid: _a, label: label(_a), color: '#40c4ff' },
					{ channelid: _b, label: label(_b), color: '#ffd740' },
				]}
			/>
			{column(_a)}
			{column(_b)}
		</Grid>
	);
}

Pair.defaultProps = {
	restreamer: null,
};

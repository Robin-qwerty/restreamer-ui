import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Trans } from '@lingui/macro';
import makeStyles from '@mui/styles/makeStyles';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import StayCurrentPortraitIcon from '@mui/icons-material/StayCurrentPortrait';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';

import ChannelPanel from './ChannelPanel';
import Publication from './Publication';
import Welcome from '../Welcome';

const useStyles = makeStyles((theme) => ({
	gridContainerL1: {
		marginBottom: '6em',
	},
}));

export default function Main(props) {
	const classes = useStyles();
	const navigate = useNavigate();
	const { channelid: _channelid } = useParams();
	const [$linked, setLinked] = React.useState({
		source: '',
		derived: [],
	});

	React.useEffect(() => {
		if (props.restreamer.SelectChannel(_channelid) !== _channelid) {
			navigate('/', { replace: true });
			return;
		}

		(async () => {
			setLinked(await props.restreamer.GetLinkedChannels(_channelid));
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [_channelid]);

	const handleEdit = (metadata) => {
		if (metadata.layout) {
			navigate(`/${_channelid}/layout`);
		} else {
			navigate(`/${_channelid}/edit`);
		}
	};

	const handleCreateVertical = () => {
		const channel = props.restreamer.GetChannel(_channelid);
		const name = (channel && channel.name ? channel.name : 'Channel') + ' (vertical)';
		const channelid = props.restreamer.CreateChannel(name);
		props.restreamer.SelectChannel(channelid);
		navigate(`/${channelid}/layout?source=${_channelid}`);
	};

	const handleDualView = (other) => () => {
		if ($linked.source.length !== 0) {
			navigate(`/pair/${$linked.source}/${_channelid}`);
		} else {
			navigate(`/pair/${_channelid}/${other}`);
		}
	};

	return (
		<Grid container justifyContent="center" spacing={1} className={classes.gridContainerL1}>
			<Grid item xs={12} sm={12} md={8}>
				<ChannelPanel
					restreamer={props.restreamer}
					channelid={_channelid}
					unconfigured={<Welcome />}
					onEdit={handleEdit}
					onInvalid={() => navigate('/', { replace: true })}
				>
					<Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1} flexWrap="wrap">
						{$linked.source.length !== 0 && (
							<Button variant="outlined" color="default" size="small" startIcon={<ViewColumnIcon />} onClick={handleDualView('')}>
								<Trans>Dual view</Trans>
							</Button>
						)}
						{$linked.derived.map((id, i) => (
							<Button key={id} variant="outlined" color="default" size="small" startIcon={<ViewColumnIcon />} onClick={handleDualView(id)}>
								{$linked.derived.length > 1 ? <Trans>Dual view {i + 1}</Trans> : <Trans>Dual view</Trans>}
							</Button>
						))}
						{$linked.source.length === 0 && (
							<Button variant="outlined" color="default" size="small" startIcon={<StayCurrentPortraitIcon />} onClick={handleCreateVertical}>
								<Trans>Create vertical channel</Trans>
							</Button>
						)}
					</Stack>
				</ChannelPanel>
			</Grid>
			<Grid item xs={12} sm={12} md={4}>
				<Publication restreamer={props.restreamer} channelid={_channelid} />
			</Grid>
		</Grid>
	);
}

Main.defaultProps = {
	restreamer: null,
};

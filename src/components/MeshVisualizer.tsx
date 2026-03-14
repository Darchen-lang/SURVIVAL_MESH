import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import Animated, {
	Easing,
	useAnimatedProps,
	useSharedValue,
	withTiming,
} from 'react-native-reanimated';
import type { MeshEdge, MeshNode } from '../types/mesh';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type MeshVisualizerRef = {
	animateHop: (fromId: string, toId: string) => void;
};

type Props = {
	nodes: MeshNode[];
	edges: MeshEdge[];
	width?: number;
	height?: number;
};

function rssiToOpacity(rssi: number): number {
	const clamped = Math.max(-95, Math.min(-35, rssi));
	return (clamped + 95) / 60;
}

const MeshVisualizer = forwardRef<MeshVisualizerRef, Props>(
	({ nodes, edges, width = 340, height = 260 }, ref) => {
		const progress = useSharedValue(0);
		const opacity = useSharedValue(0);

		// Shared values for from/to coordinates — readable inside worklets
		const fromX = useSharedValue(0);
		const fromY = useSharedValue(0);
		const toX = useSharedValue(0);
		const toY = useSharedValue(0);

		const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

		const edgeStrength = useMemo(() => {
			const map = new Map<string, number>();
			edges.forEach((e) => {
				const a = nodeMap.get(e.from);
				const b = nodeMap.get(e.to);
				if (!a || !b) return;
				map.set(`${e.from}:${e.to}`, (a.rssi + b.rssi) / 2);
			});
			return map;
		}, [edges, nodeMap]);

		useImperativeHandle(ref, () => ({
			animateHop(fromId: string, toId: string) {
				const from = nodeMap.get(fromId);
				const to = nodeMap.get(toId);
				if (!from || !to) return;

				// Write coordinates into shared values — safe for worklets
				fromX.value = from.x;
				fromY.value = from.y;
				toX.value = to.x;
				toY.value = to.y;

				progress.value = 0;
				opacity.value = 1;

				progress.value = withTiming(1, {
					duration: 800,
					easing: Easing.inOut(Easing.cubic),
				});

				opacity.value = withTiming(1, { duration: 100 }, () => {
					opacity.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
				});
			},
		}));

		const animatedHopProps = useAnimatedProps(() => {
			const x = fromX.value + (toX.value - fromX.value) * progress.value;
			const y = fromY.value + (toY.value - fromY.value) * progress.value;
			return {
				cx: x,
				cy: y,
				opacity: opacity.value,
			};
		});

		return (
			<View style={styles.container}>
				<Svg width={width} height={height}>
					<G>
						{edges.map((edge) => {
							const from = nodeMap.get(edge.from);
							const to = nodeMap.get(edge.to);
							if (!from || !to) return null;
							const signal = edgeStrength.get(`${edge.from}:${edge.to}`) ?? -90;
							return (
								<Line
									key={`${edge.from}-${edge.to}`}
									x1={from.x}
									y1={from.y}
									x2={to.x}
									y2={to.y}
									stroke="#57b6ff"
									strokeOpacity={rssiToOpacity(signal)}
									strokeWidth={2}
								/>
							);
						})}
					</G>

					<G>
						{nodes.map((node) => (
							<G key={node.id}>
								<Circle cx={node.x} cy={node.y} r={12} fill="#0f2f52" stroke="#76c6ff" strokeWidth={2} />
								<SvgText x={node.x} y={node.y + 22} fill="#d7f0ff" fontSize={11} textAnchor="middle">
									{node.label}
								</SvgText>
							</G>
						))}
					</G>

					<AnimatedCircle animatedProps={animatedHopProps} r={5} fill="#d9ff6b" />
				</Svg>
			</View>
		);
	}
);

MeshVisualizer.displayName = 'MeshVisualizer';

const styles = StyleSheet.create({
	container: {
		borderWidth: 1,
		borderColor: '#18314a',
		borderRadius: 12,
		backgroundColor: '#091824',
		overflow: 'hidden',
	},
});

export default MeshVisualizer;
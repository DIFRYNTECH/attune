import { useEffect, useMemo, useState } from "react";
import { useAttuneStore } from "../store/useAttuneStore";

export default function Wheel() {
	const { state, actions } = useAttuneStore();
	const { options, currentSpin } = state;
	const [rot, setRot] = useState(0);
	const [spinning, setSpinning] = useState(false);

	const canSpin = options?.length > 0 && !spinning;

	useEffect(() => {
		// Ensure we always have something to spin.
		if (!options?.length) actions.refreshOptions();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const spinLabel = useMemo(() => {
		if (spinning) return "Spinning…";
		if (!options?.length) return "Preparing…";
		return "Spin";
	}, [options?.length, spinning]);

	const onSpin = () => {
		if (!options?.length) {
			actions.refreshOptions();
			return;
		}
		if (spinning) return;

		setSpinning(true);
		// Visual spin
		setRot((r) => r + 360 * 4 + Math.random() * 360);

		// Pick suggestion (state)
		actions.spinPick();

		window.setTimeout(() => setSpinning(false), 1300);
	};

	return (
		<div className="wheelWrap">
			<div className="wheelStage">
				<div className="wheel" style={{ "--rot": `${rot}deg` }} aria-hidden="true" />
				<div className="hub" aria-hidden="true">
					<span>{spinning ? "…" : "SPIN"}</span>
				</div>
				<div className="pointer" aria-hidden="true" />
			</div>

			<div>
				<div className="result">
					<div className="resultTitle">Your suggestion:</div>
					<div className="resultTask">{currentSpin?.text || "Spin for a small, doable activity."}</div>
					<div className="resultMeta">
						{currentSpin?.level ? `Pace: ${currentSpin.level}` : ""}
					</div>

					<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
						<button type="button" className="btn primary" onClick={onSpin} disabled={!canSpin && !!options?.length}>
							{spinLabel}
						</button>
						<button
							type="button"
							className="btn"
							onClick={actions.addCurrent}
							disabled={!currentSpin}
							title={!currentSpin ? "Spin first" : "Add to My Day"}
						>
							Add to My Day
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

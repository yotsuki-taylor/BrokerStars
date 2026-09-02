import React from 'react';
import type { Config } from '../sim/config';

export interface DevProps {
  cfg: Config;
  seed: string;
  speed: number;
  showTruth: boolean;
  botPreset: string;
  onSeed: (s: string) => void;
  onRestart: (seed?: string, preset?: string) => void;
  onSpeed: (s: number) => void;
  onShowTruth: (v: boolean) => void;
  onBotPreset: (p: string) => void;
  /** mutate the live config; changes take effect on the next tick */
  onPatch: (fn: (c: Config) => void) => void;
  onClose: () => void;
}

function Num({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span>{label}</span>
    </label>
  );
}

export default function DevPanel(p: DevProps) {
  const c = p.cfg;
  const flagKeys = ['marketImpact', 'shorting', 'phases'] as const;
  const presets = ['rookie', 'easy', 'medium', 'hard', 'elite', 'random', 'holder'];

  return (
    <div className="dev">
      <h3>DEV PANEL</h3>

      <section>
        <label>
          seed
          <input type="text" value={p.seed} onChange={(e) => p.onSeed(e.target.value)} />
          <button onClick={() => p.onRestart()}>restart</button>
          <button onClick={() => p.onRestart(String(Math.floor(Math.random() * 1e6)))}>
            random seed
          </button>
        </label>
      </section>

      <section>
        <div>speed</div>
        {[1, 2, 4].map((s) => (
          <button key={s} className={p.speed === s ? 'on' : ''} onClick={() => p.onSpeed(s)}>
            x{s}
          </button>
        ))}
      </section>

      <section>
        <label>
          <input
            type="checkbox"
            checked={p.showTruth}
            onChange={(e) => p.onShowTruth(e.target.checked)}
          />
          show truth (draw the real future segments)
        </label>
        <label>
          <input
            type="checkbox"
            checked={c.chart.mode === 'absolute'}
            onChange={(e) => p.onPatch((x) => (x.chart.mode = e.target.checked ? 'absolute' : 'percent'))}
          />
          absolute prices on the chart
        </label>
        <label>
          <input
            type="checkbox"
            checked={c.chart.autoScale}
            onChange={(e) => p.onPatch((x) => (x.chart.autoScale = e.target.checked))}
          />
          auto-scale the vertical axis (off = fixed height)
        </label>
        <div className="grid2">
          <Num
            label="scale min"
            value={c.chart.mode === 'absolute' ? c.chart.absoluteRange[0] : c.chart.percentRange[0]}
            step={c.chart.mode === 'absolute' ? 100 : 5}
            onChange={(v) =>
              p.onPatch((x) =>
                x.chart.mode === 'absolute'
                  ? (x.chart.absoluteRange[0] = v)
                  : (x.chart.percentRange[0] = v),
              )
            }
          />
          <Num
            label="scale max"
            value={c.chart.mode === 'absolute' ? c.chart.absoluteRange[1] : c.chart.percentRange[1]}
            step={c.chart.mode === 'absolute' ? 100 : 5}
            onChange={(v) =>
              p.onPatch((x) =>
                x.chart.mode === 'absolute'
                  ? (x.chart.absoluteRange[1] = v)
                  : (x.chart.percentRange[1] = v),
              )
            }
          />
        </div>
      </section>

      <section>
        <div>flags</div>
        {flagKeys.map((f) => (
          <label key={f}>
            <input
              type="checkbox"
              checked={c.flags[f]}
              onChange={(e) => p.onPatch((x) => (x.flags[f] = e.target.checked))}
            />
            {f}
          </label>
        ))}
      </section>

      <section>
        <div>opponent</div>
        {presets.map((b) => (
          <button
            key={b}
            className={p.botPreset === b ? 'on' : ''}
            onClick={() => p.onRestart(undefined, b)}
          >
            {b}
          </button>
        ))}
      </section>

      <section>
        <div>market</div>
        <div className="grid2">
          {c.stocks.map((s, i) => (
            <React.Fragment key={s.id}>
              <Num
                label={`${s.id} noise`}
                value={s.noiseSigma}
                step={0.001}
                onChange={(v) => p.onPatch((x) => (x.stocks[i].noiseSigma = v))}
              />
              <Num
                label={`${s.id} drift`}
                value={s.driftPerStrength}
                step={0.001}
                onChange={(v) => p.onPatch((x) => (x.stocks[i].driftPerStrength = v))}
              />
            </React.Fragment>
          ))}
          <Num
            label="slippage"
            value={c.impact.slippageCoef}
            step={0.002}
            onChange={(v) => p.onPatch((x) => (x.impact.slippageCoef = v))}
          />
          <Num
            label="impact"
            value={c.impact.permanentCoef}
            step={0.002}
            onChange={(v) => p.onPatch((x) => (x.impact.permanentCoef = v))}
          />
          <Num
            label="impact decay"
            value={c.impact.decayPerTick}
            step={0.01}
            onChange={(v) => p.onPatch((x) => (x.impact.decayPerTick = v))}
          />
          <Num
            label="commission"
            value={c.match.commissionRate}
            step={0.001}
            onChange={(v) => p.onPatch((x) => (x.match.commissionRate = v))}
          />
        </div>
      </section>

      <section>
        <button onClick={p.onClose}>close (D)</button>
      </section>
    </div>
  );
}

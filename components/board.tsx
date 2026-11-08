/* Pixel PNGs stay as img so the browser does not resample them. */
/* eslint-disable @next/next/no-img-element */
import type { Cue } from "@/lib/cues";
import { xy } from "@/lib/constants";
import { isPillar } from "@/lib/constants";
import { poseForUnit } from "@/lib/sprite-layout";
import { poseForBeat, showDamage, type Beat } from "@/lib/timeline";
import { Hero } from "@/components/sprites";

type Props = {
  posA: number;
  posB: number;
  hpA: number;
  hpB: number;
  winner?: number;
  labelA: string;
  labelB: string;
  legal?: number[];
  selected?: number | null;
  aim?: "move" | "attack" | null;
  cue?: Cue | null;
  beat?: Beat | null;
};

const FLOORS = [0, 1, 2, 3, 1, 0, 3, 2];

export function Board({
  posA,
  posB,
  hpA,
  hpB,
  winner = 0,
  labelA,
  labelB,
  legal = [],
  selected = null,
  aim = null,
  cue = null,
  beat = null,
}: Props) {
  const cells = Array.from({ length: 25 }, (_, index) => index);
  return (
    <div className="stage-scene">
      <span className="torch left" aria-hidden />
      <span className="torch right" aria-hidden />
      <div className="platform">
      <img className="platform-art" src="/assets/environment/platform.png" alt="" />
      <div className="board">
        <div className="grid" role="grid" aria-label="Five by five stone arena">
        {cells.map((index) => {
          const pillar = isPillar(index);
          const variant = FLOORS[index % FLOORS.length];
          return (
            <div key={index} role="gridcell" className={`cell v${variant}`}>
              {pillar ? <img className="overlay" src="/assets/tiles/pillar.png" alt="" /> : null}
              {legal.includes(index) ? (
                <img className="overlay" src={aim === "attack" ? "/assets/effects/attack.png" : "/assets/effects/legal.png"} alt="" />
              ) : null}
              {selected === index || (beat === "move" && (index === posA || index === posB)) ? (
                <img className="overlay" src="/assets/effects/selected.png" alt="" />
              ) : null}
            </div>
          );
        })}
        <Unit team="a" pos={posA} hp={hpA} winner={winner} name={labelA} cue={cue} beat={beat} />
        <Unit team="b" pos={posB} hp={hpB} winner={winner} name={labelB} cue={cue} beat={beat} />
        </div>
      </div>
      </div>
    </div>
  );
}

function Unit({
  team,
  pos,
  hp,
  winner,
  name,
  cue,
  beat,
}: {
  team: "a" | "b";
  pos: number;
  hp: number;
  winner: number;
  name: string;
  cue: Cue | null;
  beat: Beat | null;
}) {
  const { x, y } = xy(pos);
  const pose = cue && beat ? poseForBeat(team, hp, winner, cue, beat) : poseForUnit(team, hp, winner, null);
  const dmg = showDamage(beat) ? (team === "a" ? cue?.dmgA ?? 0 : cue?.dmgB ?? 0) : 0;
  const blocked = showDamage(beat) && (team === "a" ? cue?.blockedA : cue?.blockedB);
  const walking = beat === "move" && pose.startsWith("walk");
  return (
    <div
      className={`fighter team-${team}`}
      style={{ left: `calc(var(--u) * ${x})`, top: `calc(var(--u) * ${y} - var(--u) * 16 / 32)` }}
    >
      <img className="shade" src="/assets/effects/shadow.png" alt="" />
      <Hero who={team === "a" ? "warden" : "wraith"} pose={pose} />
      {pose === "attack" ? <img className="fx" src="/assets/effects/slash.png" alt="" /> : null}
      {walking ? <i className="dust" /> : null}
      {blocked ? <b className="block">Block</b> : null}
      <span className="fighter-name">{name}</span>
      <span className="hearts" aria-label={`${hp} of 3 health`}>
        {[0, 1, 2].map((pip) => (
          <i key={pip} className={pip < hp ? "full" : "empty"} />
        ))}
      </span>
      {dmg > 0 ? <b className="damage">-{dmg}</b> : null}
    </div>
  );
}

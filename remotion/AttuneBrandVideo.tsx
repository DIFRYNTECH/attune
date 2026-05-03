import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Theme = {
  bg: string;
  bg2: string;
  card: string;
  card2: string;
  ink: string;
  muted: string;
  line: string;
  brand: string;
  brand2: string;
  green: string;
  pink: string;
};

export type AttuneBrandVideoProps = {
  openingLine: string;
  pickLine: string;
  rhythmLine: string;
  closingLine: string;
  theme: {
    light: Theme;
    dark: Theme;
  };
};

export const attuneBrandDefaults: AttuneBrandVideoProps = {
  openingLine: "Meet yourself where you are.",
  pickLine: "Choose one step that fits today.",
  rhythmLine: "Notice your rhythm across the week.",
  closingLine: "One small step toward better.",
  theme: {
    light: {
      bg: "#eef2f6",
      bg2: "#f7fafc",
      card: "rgba(255,255,255,0.92)",
      card2: "rgba(244,248,252,0.96)",
      ink: "#1b2430",
      muted: "#637180",
      line: "rgba(27,36,48,0.12)",
      brand: "#486f96",
      brand2: "#6f8fad",
      green: "#dff7ee",
      pink: "#faeaf0",
    },
    dark: {
      bg: "#131723",
      bg2: "#171c2a",
      card: "rgba(26,32,48,0.94)",
      card2: "rgba(34,42,61,0.82)",
      ink: "#eef3ff",
      muted: "rgba(181,191,212,0.82)",
      line: "rgba(238,243,255,0.12)",
      brand: "#7f8fcf",
      brand2: "#9ca9df",
      green: "rgba(87,204,165,0.18)",
      pink: "rgba(246,176,196,0.18)",
    },
  },
};

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const softEase = Easing.bezier(0.2, 0.84, 0.28, 1);

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { ...clamp, easing: ease });

const out = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [1, 0], { ...clamp, easing: ease });

const between = (frame: number, start: number, end: number, fadeFrames = 20) =>
  fade(frame, start, start + fadeFrames) * out(frame, end - fadeFrames, end);

const mix = (a: string, b: string, amount: number) => {
  if (!a.startsWith("#") || !b.startsWith("#")) return amount < 0.5 ? a : b;
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return `rgb(${channel(ar, br)}, ${channel(ag, bg)}, ${channel(ab, bb)})`;
};

const phoneW = 620;
const phoneH = 1340;

const isLightTheme = (theme: Theme) => theme.bg === "#eef2f6";

const lightSurface =
  "linear-gradient(180deg, rgba(255,255,255,.88), rgba(248,251,253,.98))";

const lightSelectedSurface =
  "linear-gradient(rgba(255,255,255,.95), rgba(248,252,253,.98)) padding-box, linear-gradient(135deg, rgba(72,111,150,.88), rgba(131,223,191,.72)) border-box";

const darkSelectedSurface =
  "linear-gradient(180deg, rgba(30,43,61,.96), rgba(25,35,53,.98)) padding-box, linear-gradient(135deg, rgba(72,111,150,.88), rgba(131,223,191,.62)) border-box";

const moodItems = [
  { label: "Worn out", icon: "🪫", tone: "tough" },
  { label: "Tired", icon: "😴", tone: "tough" },
  { label: "Overwh...", icon: "😵‍💫", tone: "tough" },
  { label: "Irritable", icon: "😣", tone: "tough" },
  { label: "Restless", icon: "⚡", tone: "tough" },
  { label: "Tender", icon: "🫧", tone: "okay" },
  { label: "Okay", icon: "🙂", tone: "okay" },
  { label: "Settled", icon: "😌", tone: "good" },
  { label: "Hopeful", icon: "🌤️", tone: "good" },
  { label: "Motivated", icon: "✨", tone: "good" },
];

const energyItems = [
  { label: "Very low", hint: "Depleted", tone: "soft" },
  { label: "Low", hint: "Drained", tone: "low" },
  { label: "Okay", hint: "Steady", tone: "okay" },
  { label: "High", hint: "Charged", tone: "high" },
];

const bodyItems = [
  { label: "Tender", hint: "Sensitive", tone: "soft" },
  { label: "Sore", hint: "Achey", tone: "low" },
  { label: "Manageable", hint: "Holding okay", tone: "okay" },
  { label: "Great", hint: "Feeling strong", tone: "high" },
];

export const AttuneBrandVideo = ({ openingLine, pickLine, rhythmLine, closingLine, theme }: AttuneBrandVideoProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const darkMix = interpolate(frame, [150, 230], [0, 1], { ...clamp, easing: softEase });
  const currentTheme = darkMix > 0.55 ? theme.dark : theme.light;

  const phoneOpacity = fade(frame, 36, 86) * out(frame, 1040, 1080);
  const phoneScale = interpolate(frame, [36, 92, 285, 330, 575, 700, 830, 900, 980, 1040], [0.86, 1, 1, 1.26, 1.26, 1, 0.92, 1, 1.05, 0.88], { ...clamp, easing: ease });
  const phoneY = interpolate(frame, [36, 92, 285, 330, 575, 700, 840, 900, 980, 1040], [90, 0, 0, 78, 78, 0, 12, 34, 78, 12], { ...clamp, easing: ease });
  const rotate = 0;

  return (
    <AbsoluteFill
      style={{
        fontFamily: '"Segoe UI", "Manrope", Arial, sans-serif',
        background:
          `radial-gradient(860px 720px at 18% 14%, rgba(127,143,207,${0.12 + darkMix * 0.16}), transparent 64%), ` +
          `radial-gradient(760px 680px at 82% 8%, rgba(84,185,198,${0.12 + Math.sin(seconds * 0.6) * 0.03}), transparent 58%), ` +
          `linear-gradient(180deg, ${mix(theme.light.bg2, theme.dark.bg, darkMix)} 0%, ${mix(theme.light.bg, theme.dark.bg2, darkMix)} 56%, ${mix("#f7fafc", "#111622", darkMix)} 100%)`,
        overflow: "hidden",
      }}
    >
      <Audio
        src={staticFile("audio/attune-ambient.wav")}
        volume={(audioFrame) =>
          interpolate(audioFrame, [0, fps * 4, fps * 31, fps * 36], [0, 0.22, 0.22, 0], clamp)
        }
      />
      <div style={grainStyle} />
      <Aurora frame={frame} darkMix={darkMix} />

      <Caption
        frame={frame}
        start={8}
        end={94}
        title={openingLine}
        tone="dark"
        top={148}
        align="left"
      />
      <Caption
        frame={frame}
        start={96}
        end={198}
        title="Check in with what is true today."
        tone="dark"
        top={145}
        align="left"
      />
      <Caption
        frame={frame}
        start={205}
        end={302}
        title="Switch into a calmer darker look."
        tone="light"
        top={145}
        align="left"
      />
      <Caption
        frame={frame}
        start={304}
        end={448}
        title={pickLine}
        tone="light"
        top={145}
        align="left"
      />
      <Caption
        frame={frame}
        start={462}
        end={575}
        title="Not up for it? Set it aside."
        tone="light"
        top={145}
        align="left"
      />
      <Caption
        frame={frame}
        start={576}
        end={690}
        title="Add what feels doable to My Day."
        tone="light"
        top={145}
        align="left"
      />
      <Caption
        frame={frame}
        start={694}
        end={808}
        title={rhythmLine}
        tone="light"
        top={145}
        align="left"
      />
      <Caption
        frame={frame}
        start={820}
        end={930}
        title="Leave the week some context."
        tone="light"
        top={145}
        align="left"
      />
      <Caption
        frame={frame}
        start={946}
        end={1030}
        title="So later, the numbers remember the story."
        tone="light"
        top={104}
        align="left"
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 268,
          width: phoneW,
          height: phoneH,
          transform: `translateX(-50%) translateY(${phoneY}px) scale(${phoneScale}) rotate(${rotate}deg)`,
          opacity: phoneOpacity,
          transformOrigin: "50% 40%",
        }}
      >
        <PhoneShell darkMix={darkMix}>
          <AppChrome theme={currentTheme} darkMix={darkMix} active={activeTab(frame)}>
            <ScreenRouter frame={frame} theme={currentTheme} darkMix={darkMix} />
          </AppChrome>
        </PhoneShell>
      </div>

      <Closing frame={frame} theme={theme.dark} line={closingLine} />
    </AbsoluteFill>
  );
};

function activeTab(frame: number) {
  if (frame < 300) return "Check-in";
  if (frame < 575) return "Pick";
  if (frame < 700) return "My Day";
  return "Weekly";
}

function ScreenRouter({ frame, theme, darkMix }: { frame: number; theme: Theme; darkMix: number }) {
  if (frame < 285) return <CheckInScreen frame={frame} theme={theme} darkMix={darkMix} />;
  if (frame < 575) return <PickScreen frame={frame} theme={theme} />;
  if (frame < 700) return <AttuneMyDayScreen frame={frame} theme={theme} />;
  return <AttuneWeeklyScreen frame={frame} theme={theme} />;
}

const grainStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0.055,
  backgroundImage:
    "linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(180deg, rgba(255,255,255,.12) 1px, transparent 1px)",
  backgroundSize: "48px 48px",
};

function Aurora({ frame, darkMix }: { frame: number; darkMix: number }) {
  const drift = interpolate(frame, [0, 900], [0, 62], clamp);
  return (
    <>
      <div
        style={{
          position: "absolute",
          width: 720,
          height: 720,
          borderRadius: "50%",
          left: -210 + drift,
          top: 1040,
          background: `radial-gradient(circle, rgba(84,185,198,${0.11 + darkMix * 0.08}), transparent 68%)`,
          filter: "blur(18px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: "50%",
          right: -260 - drift * 0.6,
          top: 120,
          background: `radial-gradient(circle, rgba(127,143,207,${0.13 + darkMix * 0.12}), transparent 70%)`,
          filter: "blur(22px)",
        }}
      />
    </>
  );
}

function Caption({
  frame,
  start,
  end,
  title,
  tone,
  top,
  align = "center",
}: {
  frame: number;
  start: number;
  end: number;
  title: string;
  tone: "light" | "dark";
  top: number;
  align?: "left" | "center";
}) {
  const visible = between(frame, start, end, 26);
  const y = interpolate(frame, [start, start + 42], [18, 0], { ...clamp, easing: ease });
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: align === "center" ? 0 : 92,
        right: align === "center" ? 0 : "auto",
        width: align === "center" ? "100%" : 720,
        textAlign: align,
        opacity: visible,
        transform: `translateY(${y}px)`,
        color: tone === "light" ? "#eef3ff" : "#1b2430",
        fontSize: align === "center" ? 42 : 44,
        lineHeight: 1.06,
        fontWeight: 860,
        letterSpacing: 0,
        zIndex: 6,
        textShadow: tone === "light" ? "0 18px 42px rgba(0,0,0,.26)" : "none",
      }}
    >
      {title}
    </div>
  );
}

function PhoneShell({ children, darkMix }: { children: React.ReactNode; darkMix: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 74,
        padding: 20,
        background:
          darkMix < 0.5
            ? "linear-gradient(145deg, rgba(255,255,255,.92), rgba(225,232,241,.78) 34%, rgba(183,196,211,.62) 100%)"
            : "linear-gradient(145deg, rgba(255,255,255,.78), rgba(255,255,255,.12) 26%, rgba(14,19,32,.88) 72%)",
        boxShadow: darkMix < 0.5
          ? "0 58px 150px rgba(38,66,94,.20), inset 0 1px 0 rgba(255,255,255,.92)"
          : "0 58px 150px rgba(6,10,24,.44), inset 0 1px 0 rgba(255,255,255,.72)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 58,
          overflow: "hidden",
          background: darkMix < 0.5 ? "#eef2f6" : "#111622",
          border: "1px solid rgba(255,255,255,.18)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function AppChrome({
  children,
  theme,
  darkMix,
  active,
}: {
  children: React.ReactNode;
  theme: Theme;
  darkMix: number;
  active: string;
}) {
  return (
    <div
      style={{
        height: "100%",
        padding: "34px 28px 0",
        background:
          darkMix < 0.5
            ? "radial-gradient(520px 340px at 14% -4%, rgba(72,111,150,.16), transparent 62%), radial-gradient(520px 340px at 88% 4%, rgba(185,202,217,.24), transparent 56%), linear-gradient(180deg, #f5f8fb 0%, #eef2f6 52%, #f7fafc 100%)"
            : "radial-gradient(520px 340px at 14% -4%, rgba(127,143,207,.18), transparent 62%), radial-gradient(520px 340px at 88% 4%, rgba(67,82,118,.22), transparent 56%), linear-gradient(180deg, #131723 0%, #171c2a 52%, #141924 100%)",
        color: theme.ink,
        position: "relative",
      }}
    >
      <TopBar theme={theme} darkMix={darkMix} />
      <div style={{ height: 1014, overflow: "hidden" }}>{children}</div>
      <BottomNav theme={theme} active={active} />
    </div>
  );
}

function LogoMark({ size = 60 }: { size?: number }) {
  const markUrl = staticFile("attune-logo-final.svg");
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.34,
        background:
          "radial-gradient(28px 26px at 30% 24%, rgba(255,255,255,.18), transparent 58%), linear-gradient(145deg, #7f8fcf, #9ca9df)",
        border: "1px solid rgba(230,237,255,.22)",
        boxShadow: "0 14px 28px rgba(5,8,24,.26)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "3%",
          background: "#f7f9ff",
          WebkitMaskImage: `url(${markUrl})`,
          WebkitMaskPosition: "48% 56%",
          WebkitMaskRepeat: "no-repeat",
          WebkitMaskSize: "206%",
          maskImage: `url(${markUrl})`,
          maskPosition: "48% 56%",
          maskRepeat: "no-repeat",
          maskSize: "206%",
        }}
      />
    </div>
  );
}

function TopBar({ theme, darkMix }: { theme: Theme; darkMix: number }) {
  return (
    <div
      style={{
        height: 122,
        borderRadius: 38,
        border: `1px solid ${theme.line}`,
        background:
          darkMix < 0.5
            ? "radial-gradient(140px 90px at 16% 0%, rgba(255,255,255,.68), transparent 70%), linear-gradient(135deg, rgba(255,255,255,.62), rgba(237,243,249,.40)), rgba(255,255,255,.60)"
            : "radial-gradient(140px 90px at 16% 0%, rgba(255,255,255,.08), transparent 70%), linear-gradient(135deg, rgba(127,143,207,.18), rgba(26,32,48,.50)), rgba(19,23,35,.56)",
        display: "flex",
        alignItems: "center",
        padding: "18px 22px",
        gap: 16,
        boxShadow: darkMix < 0.5 ? "0 10px 24px rgba(27,36,48,.06)" : "0 16px 36px rgba(0,0,0,.18)",
      }}
    >
      <LogoMark size={62} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 860, lineHeight: 1, color: theme.ink }}>Attune</div>
          <div style={plusPill}>Plus</div>
        </div>
        <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.24, color: theme.muted, width: 362 }}>
          Meet yourself where you are, then take one small step toward better.
        </div>
      </div>
    </div>
  );
}

const plusPill: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 15,
  lineHeight: 1,
  fontWeight: 900,
  color: "#fff",
  background: "linear-gradient(135deg, #7f8fcf, #9ca9df)",
};

function Card({ children, theme }: { children: React.ReactNode; theme: Theme }) {
  return (
    <div
      style={{
        marginTop: 26,
        borderRadius: 34,
        padding: 30,
        background: theme.bg === "#eef2f6"
          ? "linear-gradient(180deg, rgba(255,255,255,.72), rgba(255,255,255,.94)) padding-box, linear-gradient(180deg, rgba(255,255,255,.60), rgba(72,111,150,.08)) border-box"
          : "linear-gradient(180deg, rgba(22,29,54,.94), rgba(18,24,46,.98)) padding-box, linear-gradient(180deg, rgba(255,255,255,.08), rgba(127,143,207,.14)) border-box",
        border: "1px solid transparent",
        boxShadow: theme.bg === "#eef2f6" ? "0 16px 44px rgba(27,36,48,.10)" : "0 24px 56px rgba(0,0,0,.34)",
      }}
    >
      {children}
    </div>
  );
}

function CheckInScreen({ frame, theme }: { frame: number; theme: Theme; darkMix: number }) {
  const progress = fade(frame, 92, 180);
  return (
    <Card theme={theme}>
      <h2 style={{ ...heading(theme), fontSize: 28, whiteSpace: "nowrap" }}>How are you feeling, Brooklyn?</h2>
      <div style={sectionTitle(theme)}>Mood (pick up to 2)</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        {moodItems.map(
          (mood, i) => (
            <MoodTile
              key={mood.label}
              label={mood.label}
              icon={mood.icon}
              tone={mood.tone}
              index={i}
              active={i === 6 || (i === 8 && progress > 0.6)}
              theme={theme}
            />
          ),
        )}
      </div>
      <div style={sectionTitle(theme)}>Energy</div>
      <PillGrid items={energyItems} activeIndex={2} theme={theme} progress={progress} />
      <div style={sectionTitle(theme)}>Body</div>
      <PillGrid items={bodyItems} activeIndex={2} theme={theme} progress={progress} />
      <div style={sectionTitle(theme)}>Pace for today <span style={{ fontSize: 13 }}>(defaulted, but adjustable)</span></div>
      <PaceGrid theme={theme} progress={progress} />
      <OptionalNote theme={theme} />
    </Card>
  );
}

function FlowHint({ theme, progress }: { theme: Theme; progress: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr",
        gap: 12,
        alignItems: "center",
        padding: "12px 14px",
        borderRadius: 20,
        border: `1px solid ${theme.line}`,
        background: theme.card2,
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [10, 0], clamp)}px)`,
      }}
    >
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})`, color: "#fff", display: "grid", placeItems: "center", fontWeight: 900 }}>1</div>
      <div style={{ color: theme.muted, fontSize: 14, fontWeight: 740 }}>Check in, get realistic options, build a weekly rhythm.</div>
    </div>
  );
}

function ThemeSwitch({ progress, darkMix }: { progress: number; darkMix: number }) {
  const knob = interpolate(progress, [0, 1], [3, 37], { ...clamp, easing: softEase });
  return (
    <div
      style={{
        width: 72,
        height: 38,
        borderRadius: 999,
        background: darkMix > 0.5 ? "rgba(127,143,207,.36)" : "rgba(25,28,42,.10)",
        border: "1px solid rgba(127,143,207,.20)",
        padding: 3,
        boxShadow: darkMix > 0.5 ? "0 12px 24px rgba(127,143,207,.22)" : "none",
      }}
    >
      <div
        style={{
          width: 31,
          height: 31,
          borderRadius: "50%",
          transform: `translateX(${knob}px)`,
          background: "linear-gradient(135deg, #fff, #dbe4f0)",
        }}
      />
    </div>
  );
}

function moodTint(tone: string) {
  if (tone === "tough") return ["rgba(245,158,11,.18)", "rgba(244,63,94,.11)"];
  if (tone === "good") return ["rgba(131,223,191,.18)", "rgba(72,111,150,.10)"];
  return ["rgba(72,111,150,.13)", "rgba(131,223,191,.13)"];
}

function pillTint(tone: string) {
  if (tone === "low") return "linear-gradient(180deg, rgba(245,158,11,.12), rgba(244,114,182,.04)), ";
  if (tone === "okay") return "linear-gradient(180deg, rgba(72,111,150,.09), rgba(131,223,191,.05)), ";
  if (tone === "high") return "linear-gradient(180deg, rgba(56,189,248,.11), rgba(72,111,150,.04)), ";
  return "linear-gradient(180deg, rgba(244,114,182,.09), rgba(72,111,150,.035)), ";
}

function MoodTile({ label, icon, tone, active, theme }: { label: string; icon: string; tone: string; index: number; active: boolean; theme: Theme }) {
  const light = isLightTheme(theme);
  const [tintA, tintB] = moodTint(tone);
  return (
    <div
      style={{
        height: 78,
        borderRadius: 20,
        display: "grid",
        placeItems: "center",
        padding: "8px 6px 7px",
        position: "relative",
        overflow: "hidden",
        border: active ? "1px solid transparent" : `1px solid ${theme.line}`,
        background: active
          ? light
            ? lightSelectedSurface
            : darkSelectedSurface
          : light
            ? `${lightSurface} padding-box, linear-gradient(180deg, rgba(255,255,255,.74), rgba(72,111,150,.10)) border-box`
            : theme.card2,
        boxShadow: active
          ? light
            ? "0 0 0 4px rgba(72,111,150,.12), 0 18px 34px rgba(72,111,150,.14)"
            : "0 0 0 4px rgba(72,111,150,.16), 0 20px 36px rgba(0,0,0,.34)"
          : light
            ? "inset 0 1px 0 rgba(255,255,255,.34), 0 10px 18px rgba(20,30,60,.06)"
            : "none",
      }}
    >
      {light ? (
        <div
          style={{
            position: "absolute",
            inset: "-30%",
            background: `radial-gradient(circle at 30% 25%, ${tintA}, transparent 55%), radial-gradient(circle at 75% 65%, ${tintB}, transparent 60%)`,
            transform: "rotate(12deg)",
          }}
        />
      ) : null}
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          fontSize: 22,
          lineHeight: 1,
          background: light
            ? "radial-gradient(18px 15px at 30% 25%, rgba(255,255,255,.86), transparent 62%), linear-gradient(180deg, rgba(255,255,255,.86), rgba(242,247,251,.96))"
            : active
              ? "linear-gradient(180deg, rgba(72,111,150,.32), rgba(34,42,61,.94))"
              : `linear-gradient(135deg, ${theme.brand}22, ${theme.brand2}44)`,
          border: `1px solid ${active && !light ? "rgba(131,223,191,.40)" : theme.line}`,
          boxShadow: active
            ? light
              ? "0 10px 20px rgba(72,111,150,.22)"
              : "0 10px 20px rgba(0,0,0,.24)"
            : light
              ? "inset 0 1px 0 rgba(255,255,255,.52), 0 10px 16px rgba(20,30,60,.08)"
              : "none",
          position: "relative",
          zIndex: 1,
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 900, lineHeight: 1.05, color: theme.muted, textAlign: "center", zIndex: 1 }}>{label}</div>
    </div>
  );
}

function PillGrid({ items, activeIndex, theme, progress }: { items: Array<{ label: string; hint: string; tone: string }>; activeIndex: number; theme: Theme; progress: number }) {
  const light = isLightTheme(theme);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
      {items.map((item, i) => {
        const glow = i === activeIndex ? interpolate(progress, [0.2, 1], [0.2, 1], clamp) : 0;
        const active = i === activeIndex;
        return (
          <div
            key={item.label}
            style={{
              height: 64,
              borderRadius: 18,
              display: "grid",
              placeItems: "center",
              border: active ? "1px solid transparent" : `1px solid ${theme.line}`,
              background: active
                ? light
                  ? lightSelectedSurface
                  : darkSelectedSurface
                : light
                  ? `${pillTint(item.tone)}${lightSurface}`
                  : theme.card2,
              color: theme.ink,
              boxShadow: active
                ? light
                  ? `0 0 0 4px rgba(72,111,150,${0.07 + glow * 0.05}), 0 14px 26px rgba(72,111,150,.14)`
                  : `0 0 0 4px rgba(84,185,198,${0.12 + glow * 0.12})`
                : light
                  ? "inset 0 1px 0 rgba(255,255,255,.36), 0 10px 18px rgba(20,30,60,.06)"
                  : "none",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.05, fontWeight: 930, color: theme.ink }}>{item.label}</div>
              <div style={{ fontSize: 9.5, lineHeight: 1.05, fontWeight: 820, color: theme.muted }}>{item.hint}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaceGrid({ theme, progress }: { theme: Theme; progress: number }) {
  const items = [
    ["Rest", "🛏️"],
    ["Gentle", "🍃"],
    ["Light", "🚶"],
    ["Steady", "🧭"],
    ["Capable", "🌊"],
    ["Brave", "🔥"],
  ];
  const light = isLightTheme(theme);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {items.map(([item, icon]) => {
        const active = item === "Capable";
        const glow = active ? interpolate(progress, [0.2, 1], [0.2, 1], clamp) : 0;
        return (
          <div
            key={item}
            style={{
              height: 55,
              borderRadius: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: active ? `1px solid rgba(72,111,150,${0.42 + glow * 0.28})` : `1px solid ${theme.line}`,
              background: active
                ? `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})`
                : light
                  ? lightSurface
                  : theme.card2,
              color: active ? "#fff" : theme.ink,
              fontSize: 16,
              fontWeight: 900,
              boxShadow: active
                ? "0 14px 28px rgba(72,111,150,.16)"
                : light
                  ? "inset 0 1px 0 rgba(255,255,255,.38), 0 10px 18px rgba(20,30,60,.055)"
                  : "none",
            }}
          >
            <span
              style={{
                width: 25,
                height: 25,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 15,
                background: active ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.78)",
                boxShadow: light && !active ? "0 6px 12px rgba(20,30,60,.06)" : "none",
              }}
            >
              {icon}
            </span>
            <span>{item}</span>
          </div>
        );
      })}
    </div>
  );
}

function OptionalNote({ theme }: { theme: Theme }) {
  const light = isLightTheme(theme);
  return (
    <div
      style={{
        marginTop: 22,
        height: 78,
        borderRadius: 24,
        border: `1px solid ${theme.line}`,
        background: light ? lightSurface : theme.card2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        color: theme.muted,
        fontSize: 17,
        fontWeight: 900,
        boxShadow: light ? "inset 0 1px 0 rgba(255,255,255,.42), 0 14px 24px rgba(20,30,60,.06)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        Optional note
        <span style={{ width: 27, height: 27, borderRadius: "50%", display: "inline-grid", placeItems: "center", border: `1px solid ${theme.line}`, fontSize: 14 }}>i</span>
      </div>
      <span style={{ fontSize: 23, lineHeight: 1 }}>⌃</span>
    </div>
  );
}

function PickScreen({ frame, theme }: { frame: number; theme: Theme }) {
  const firstDetailStart = 340;
  const firstDetailEnd = 472;
  const secondDetailStart = 476;
  const secondDetailEnd = 570;
  const firstDetail = frame >= firstDetailStart && frame < firstDetailEnd;
  const secondDetail = frame >= secondDetailStart && frame < secondDetailEnd;
  const firstAdded = frame >= 428;
  const secondPassed = frame >= 548;
  const detailDim = firstDetail
    ? between(frame, firstDetailStart, firstDetailEnd, 38)
    : secondDetail
      ? between(frame, secondDetailStart, secondDetailEnd, 34)
      : 0;
  const boardOptions = [
    "Walk around the house for 5 minutes",
    "Call or voice note someone supportive",
    "Prepare a simple snack or light meal",
    "Write down 3 small wins from today",
    "Set a 10-minute timer and do one calm task",
    "Spend 15 minutes on a hobby",
    "Do a seated stretching routine",
    "Put on music and do light movement",
    "Take one thing off your list",
    "Drink water and wash your face",
    "Step outside for two minutes",
    "Do one gentle reset breath",
    "Tidy one small surface",
    "Send one low-pressure message",
    "Plan an easy tomorrow start",
  ];
  return (
    <Card theme={theme}>
      <div style={{ opacity: 1 - detailDim * 0.65 }}>
        <h2 style={heading(theme)}>Pick an activity</h2>
        <div style={sub(theme)}>Personalized from your check-in.</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
          <h3 style={{ ...heading(theme), fontSize: 30 }}>What feels right?</h3>
          <div style={smallPill(theme)}>Reset today</div>
        </div>
        <div style={{ color: theme.muted, fontSize: 15, marginTop: 12 }}>Tap any tile to reveal a small step.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 11, marginTop: 18, position: "relative" }}>
          {boardOptions.map((text, i) => (
            <BoardTile
              key={`${text}-${i}`}
              text={text}
              shimmer={i < 3}
              frame={frame}
              selected={firstAdded && i === 4}
              passed={secondPassed && i === 1}
              theme={theme}
            />
          ))}
        </div>
      </div>
      {firstDetail ? <DetailSheet frame={frame} start={firstDetailStart} end={firstDetailEnd} mode="add" title="Set a 10-minute timer and do one calm task" theme={theme} /> : null}
      {secondDetail ? <DetailSheet frame={frame} start={secondDetailStart} end={secondDetailEnd} mode="pass" title="Call or voice note someone supportive" theme={theme} /> : null}
    </Card>
  );
}

function BoardTile({
  text,
  shimmer,
  frame,
  selected,
  passed,
  theme,
}: {
  text: string;
  shimmer?: boolean;
  frame: number;
  selected?: boolean;
  passed?: boolean;
  theme: Theme;
}) {
  const shimmerX = shimmer ? interpolate((frame % 90), [0, 90], [-90, 180], clamp) : -90;
  return (
    <div
      style={{
        height: 104,
        borderRadius: 22,
        border: selected
          ? "1px solid rgba(106,221,185,.42)"
          : passed
            ? "1px solid rgba(246,176,196,.40)"
            : `1px solid ${theme.line}`,
        background: selected
          ? `linear-gradient(180deg, ${theme.green}, ${theme.card2})`
          : passed
            ? `linear-gradient(180deg, ${theme.pink}, ${theme.card2})`
            : `linear-gradient(145deg, rgba(255,255,255,.06), ${theme.card2})`,
        position: "relative",
        overflow: "hidden",
        padding: 14,
        color: theme.ink,
        fontSize: 13.2,
        lineHeight: 1.03,
        fontWeight: 900,
        display: "flex",
        alignItems: text ? "center" : "center",
        justifyContent: text ? "flex-start" : "center",
      }}
    >
      {shimmer ? (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: shimmerX,
            width: 56,
            height: 4,
            borderRadius: 999,
            background: "rgba(84,185,198,.62)",
          }}
        />
      ) : null}
      {text ? text : <div style={{ width: 22, height: 22, borderRadius: 8, background: "rgba(127,143,207,.28)" }} />}
    </div>
  );
}

function DetailSheet({ frame, start, end, mode, title, theme }: { frame: number; start: number; end: number; mode: "add" | "pass"; title: string; theme: Theme }) {
  const p = fade(frame, start, start + 44) * out(frame, end - 44, end);
  const y = interpolate(p, [0, 1], [104, 0], { ...clamp, easing: softEase });
  const scale = interpolate(p, [0, 1], [0.965, 1], { ...clamp, easing: softEase });
  const actionProgress = fade(frame, start + 56, start + 78);
  const isDark = theme.bg !== "#eef2f6";
  const sheetBackground = isDark
    ? "linear-gradient(180deg, rgba(47,55,78,.98), rgba(34,42,61,.98))"
    : "linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.96))";
  const sheetBorder = isDark ? "rgba(238,243,255,.18)" : "rgba(27,36,48,.10)";
  const wellBackground = isDark ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.58)";
  const chipBorder = isDark ? "rgba(238,243,255,.12)" : "rgba(27,36,48,.10)";
  const primaryLabel = mode === "add" ? "Added to My Day" : "Pick something else";
  return (
    <div
      style={{
        position: "absolute",
        left: 28,
        right: 28,
        top: 305,
        borderRadius: 34,
        padding: 26,
        background: sheetBackground,
        color: theme.ink,
        border: `1px solid ${sheetBorder}`,
        boxShadow: isDark ? "0 38px 90px rgba(6,10,24,.44)" : "0 38px 90px rgba(6,10,24,.22)",
        opacity: p,
        transform: `translateY(${y}px) scale(${scale})`,
      }}
    >
      <div style={{ width: 54, height: 6, borderRadius: 999, background: isDark ? "rgba(238,243,255,.30)" : "rgba(99,113,128,.34)", margin: "0 auto 22px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={detailChip(isDark ? "#b9c6ff" : "#486f96", isDark ? "rgba(127,143,207,.28)" : "rgba(72,111,150,.18)")}>Small step</span>
        <span style={detailChip(mode === "add" ? "#9de5cb" : "#f0b4c8", mode === "add" ? "rgba(106,221,185,.34)" : "rgba(246,176,196,.42)")}>
          {mode === "add" ? "In My Day" : "Not today"}
        </span>
      </div>
      <div style={{ marginTop: 18, fontSize: 28, lineHeight: 1.05, fontWeight: 900, letterSpacing: 0 }}>{title}</div>
      <div style={{ marginTop: 22, border: `1px solid ${chipBorder}`, borderRadius: 22, padding: 18, background: wellBackground }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: theme.muted, marginBottom: 8 }}>Why this fits</div>
        <div style={{ color: theme.muted, fontSize: 16, lineHeight: 1.32, fontWeight: 750 }}>
          This builds on the steadier mood you checked in with.
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        {["One small thing", "No setup", "steady pace"].map((tag) => (
          <span key={tag} style={{ padding: "8px 12px", borderRadius: 999, border: `1px solid ${chipBorder}`, fontSize: 13, fontWeight: 850, color: theme.muted }}>
            {tag}
          </span>
        ))}
      </div>
      <div
        style={{
          marginTop: 22,
          height: 62,
          borderRadius: 999,
          background: mode === "add"
            ? `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})`
            : "linear-gradient(135deg, #f3d6df, #faeaf0)",
          color: mode === "add" ? "rgba(255,255,255,.84)" : "#7f3d55",
          display: "grid",
          placeItems: "center",
          fontSize: 18,
          fontWeight: 900,
          boxShadow: actionProgress ? "0 16px 36px rgba(72,111,150,.18)" : "none",
        }}
      >
        {primaryLabel}
      </div>
      {mode === "add" ? (
        <div
          style={{
            marginTop: 14,
            height: 58,
            borderRadius: 999,
            border: `1px solid ${chipBorder}`,
            background: isDark ? "rgba(18,24,46,.38)" : "rgba(255,255,255,.62)",
            color: theme.ink,
            display: "grid",
            placeItems: "center",
            fontSize: 18,
            fontWeight: 900,
          }}
        >
          Pick something else
        </div>
      ) : null}
    </div>
  );
}

function detailChip(color: string, border: string): React.CSSProperties {
  return {
    padding: "6px 11px",
    borderRadius: 999,
    border: `1px solid ${border}`,
    color,
    fontSize: 14,
    fontWeight: 900,
  };
}

function MyDayScreen({ frame, theme }: { frame: number; theme: Theme }) {
  const p = fade(frame, 574, 616);
  return (
    <Card theme={theme}>
      <h2 style={heading(theme)}>My Day</h2>
      <div style={sub(theme)}>Aim for 2-5 tasks. You can keep it light.</div>
      <div
        style={{
          borderRadius: 26,
          padding: 22,
          background: `linear-gradient(180deg, ${theme.brand}18, ${theme.card2})`,
          border: `1px solid ${theme.line}`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 900, color: theme.muted }}>Personal note</div>
        <div style={{ marginTop: 12, fontSize: 24, lineHeight: 1.12, fontWeight: 900, color: theme.ink }}>Small steps, steady rhythm</div>
        <div style={{ marginTop: 14, fontSize: 16, lineHeight: 1.42, color: theme.muted }}>
          Your day stays realistic, even when your energy changes.
        </div>
      </div>
      <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
        {[
          ["Prepare a simple snack or light meal", 600],
          ["Set a 10-minute timer and do one calm task", 628],
          ["Walk around the house for 5 minutes", 656],
        ].map(([task, doneAt]) => (
          <TaskRow key={task} task={task} checked={frame >= Number(doneAt)} progress={p} theme={theme} />
        ))}
      </div>
    </Card>
  );
}

function TaskRow({ task, checked, progress, theme }: { task: string; checked: boolean; progress: number; theme: Theme }) {
  return (
    <div
      style={{
        minHeight: 82,
        borderRadius: 24,
        padding: "16px 18px",
        display: "grid",
        gridTemplateColumns: "30px 1fr",
        alignItems: "center",
        gap: 16,
        color: theme.ink,
        fontSize: 17,
        lineHeight: 1.18,
        fontWeight: 850,
        border: checked ? "1px solid rgba(106,221,185,.34)" : `1px solid ${theme.line}`,
        background: checked ? `linear-gradient(180deg, ${theme.green}, ${theme.card2})` : theme.card2,
        opacity: progress,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: checked ? `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})` : "transparent",
          border: checked ? "0" : `1px solid ${theme.line}`,
          color: "#fff",
          fontSize: 17,
          fontWeight: 900,
        }}
      >
        {checked ? "✓" : ""}
      </div>
      <span>{task}</span>
    </div>
  );
}

function WeeklyScreen({ frame, theme }: { frame: number; theme: Theme }) {
  const p = fade(frame, 700, 744);
  const score = Math.round(interpolate(frame, [706, 790], [42, 78], clamp));
  const historyShift = interpolate(frame, [746, 822], [0, -210], { ...clamp, easing: softEase });
  return (
    <Card theme={theme}>
      <h2 style={heading(theme)}>Weekly</h2>
      <div style={sub(theme)}>Patterns without turning your wellbeing into a dashboard.</div>
      <div
        style={{
          borderRadius: 28,
          padding: 24,
          background: `linear-gradient(180deg, ${theme.brand}20, ${theme.card2})`,
          border: `1px solid ${theme.line}`,
          opacity: p,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 950, color: theme.muted, textTransform: "uppercase", letterSpacing: 0 }}>This week&apos;s shape</div>
        <div style={{ marginTop: 12, fontSize: 30, fontWeight: 950, color: theme.ink, lineHeight: 1.05 }}>Gentle momentum</div>
        <div style={{ marginTop: 12, color: theme.muted, fontSize: 16, lineHeight: 1.38 }}>
          You showed up on more days than last week. Gentle tasks helped most.
        </div>
        <div style={{ marginTop: 22, height: 16, borderRadius: 999, background: "rgba(238,243,255,.10)", overflow: "hidden" }}>
          <div style={{ width: `${score}%`, height: "100%", borderRadius: 999, background: `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})` }} />
        </div>
        <div style={{ marginTop: 12, color: theme.muted, fontSize: 14, fontWeight: 900 }}>Momentum {score}/100</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginTop: 16, opacity: p }}>
        <WeeklyStat label="Presence" value="5/7" text="days checked in" theme={theme} />
        <WeeklyStat label="Completions" value="8" text="small steps done" theme={theme} />
      </div>
      <div style={{ marginTop: 18, opacity: p }}>
        <div style={{ fontSize: 15, color: theme.muted, fontWeight: 900, marginBottom: 10 }}>History</div>
        <div style={{ overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 12, transform: `translateX(${historyShift}px)` }}>
            {["This week", "Last week", "Apr 13", "Apr 06", "Mar 30"].map((label, i) => (
              <HistoryCard key={label} label={label} score={[78, 62, 56, 68, 44][i]} active={i === 0} theme={theme} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function WeeklyStat({ label, value, text, theme }: { label: string; value: string; text: string; theme: Theme }) {
  return (
    <div style={{ borderRadius: 22, border: `1px solid ${theme.line}`, background: theme.card2, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: theme.muted }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 32, lineHeight: 1, fontWeight: 950, color: theme.ink }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: theme.muted, fontWeight: 760 }}>{text}</div>
    </div>
  );
}

function HistoryCard({ label, score, active, theme }: { label: string; score: number; active?: boolean; theme: Theme }) {
  return (
    <div
      style={{
        flex: "0 0 144px",
        borderRadius: 22,
        padding: 16,
        border: active ? `1px solid ${theme.brand2}` : `1px solid ${theme.line}`,
        background: active ? `linear-gradient(180deg, ${theme.brand}20, ${theme.card2})` : theme.card2,
      }}
    >
      <div style={{ fontSize: 13, color: theme.muted, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 28, fontWeight: 950, color: theme.ink }}>{score}</div>
      <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(238,243,255,.10)", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", borderRadius: 999, background: `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})` }} />
      </div>
    </div>
  );
}

function AttuneMyDayScreen({ frame, theme }: { frame: number; theme: Theme }) {
  const p = fade(frame, 574, 616);
  const tasks = [
    ["Prepare a simple snack or light meal", true],
    ["Write down 3 small wins from today", false],
    ["Try a beginner yoga/stretch video (10 minutes)", true],
    ["Call or voice note someone supportive", false],
    ["Spend 15 minutes on a hobby (music, craft, reading)", false],
  ] as const;
  return (
    <Card theme={theme}>
      <h2 style={heading(theme)}><span style={{ fontSize: 27, marginRight: 8 }}>⏱</span>My Day</h2>
      <div style={sub(theme)}>Aim for 2-5 tasks. You can add up to 10 if you&apos;d like.</div>
      <div style={attuneInnerCard(theme)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 900, color: theme.muted }}>
            Personal note <AttuneInfo theme={theme} />
          </div>
          <div style={{ width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 950, color: theme.brand2, background: "rgba(127,143,207,.14)", border: `1px solid ${theme.line}` }}>AI</div>
        </div>
        <div style={{ marginTop: 16, fontSize: 25, lineHeight: 1.08, fontWeight: 900, color: theme.ink }}>Take a Small Step Forward</div>
        <div style={{ marginTop: 14, fontSize: 16, lineHeight: 1.42, color: theme.muted }}>
          With a sense of hope and a manageable pace, focus on completing your tasks today.
        </div>
      </div>
      <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
        {tasks.map(([task, checked]) => (
          <AttuneTaskRow key={task} task={task} checked={checked} progress={p} theme={theme} />
        ))}
      </div>
    </Card>
  );
}

function AttuneTaskRow({ task, checked, progress, theme }: { task: string; checked: boolean; progress: number; theme: Theme }) {
  return (
    <div style={{ minHeight: 94, borderRadius: 24, padding: "18px 20px", display: "grid", gridTemplateColumns: "30px 1fr 72px", alignItems: "center", gap: 16, color: checked ? theme.ink : theme.muted, fontSize: 17, lineHeight: 1.18, fontWeight: 900, border: checked ? "1px solid rgba(91,190,167,.54)" : "1px solid rgba(145,157,190,.22)", background: checked ? "linear-gradient(180deg, rgba(41,68,75,.78), rgba(31,43,61,.88))" : "linear-gradient(180deg, rgba(34,42,61,.74), rgba(29,36,55,.86))", opacity: progress }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: checked ? `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})` : "transparent", border: checked ? "0" : "1px solid rgba(145,157,190,.32)", color: "#fff", fontSize: 17, fontWeight: 900 }}>
        {checked ? "✓" : ""}
      </div>
      <span>{task}</span>
      <span style={{ justifySelf: "end", color: theme.muted, fontSize: 15, fontWeight: 850 }}>Remove</span>
    </div>
  );
}

function AttuneWeeklyScreen({ frame, theme }: { frame: number; theme: Theme }) {
  const p = fade(frame, 700, 744);
  const scrollY = interpolate(frame, [742, 815, 850, 925, 970], [0, -350, -620, -620, -590], { ...clamp, easing: softEase });
  const historyShift = interpolate(frame, [928, 986], [0, -330], { ...clamp, easing: softEase });
  const selectedPast = frame > 946;
  return (
    <Card theme={theme}>
      <div style={{ opacity: p, transform: `translateY(${scrollY}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AttuneInfo theme={theme} />
          <h2 style={heading(theme)}>Weekly</h2>
        </div>
        <div style={{ marginTop: 18, textAlign: "center", color: theme.muted, fontSize: 16, fontWeight: 900 }}>
          This week: 27 Apr to 3 May
        </div>
        <div style={sub(theme)}>A calmer digest of how the week is landing.</div>
        <div style={attuneInnerCard(theme)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 950, color: theme.muted, textTransform: "uppercase", letterSpacing: 0 }}>This week&apos;s shape</div>
            <AttuneInfo theme={theme} />
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 31, fontWeight: 950, color: theme.ink, lineHeight: 1.05 }}>Starting</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: theme.muted }}>Momentum 24/100</div>
          </div>
          <div style={{ marginTop: 14, color: theme.ink, fontSize: 17, lineHeight: 1.28, fontWeight: 850 }}>
            Something has started to move. A few returns are already shaping the week.
          </div>
          <AttuneProgress value={24} theme={theme} />
          <div style={{ marginTop: 12, color: theme.muted, fontSize: 15, lineHeight: 1.32 }}>
            Showing up matters most. Finishing activities adds a small lift.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginTop: 20 }}>
            <AttuneWeeklyStat label="Presence" value="1/7" text="day checked in" theme={theme} />
            <AttuneWeeklyStat label="Completions" value="4" text="tasks finished" theme={theme} />
          </div>
          <div style={{ marginTop: 18, fontSize: 17, fontWeight: 900, color: theme.ink }}>Capable shaped the week so far.</div>
        </div>
        <div style={attunePanel(theme)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: theme.muted, fontSize: 17, fontWeight: 900 }}>
            Pattern spotlight <AttuneInfo theme={theme} />
          </div>
          <div style={{ marginTop: 18, borderRadius: 22, padding: 22, background: "rgba(66,73,90,.54)", border: `1px solid ${theme.line}` }}>
            <span style={{ padding: "6px 12px", borderRadius: 999, color: "#d1b469", background: "rgba(194,156,65,.14)", border: "1px solid rgba(194,156,65,.26)", fontSize: 13, fontWeight: 900 }}>Schedule</span>
            <div style={{ marginTop: 14, color: theme.ink, fontSize: 18, lineHeight: 1.28, fontWeight: 850 }}>
              It looks like weekends are sometimes a bit easier for check-ins.
            </div>
          </div>
        </div>
        <div style={attunePanel(theme)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: theme.muted, fontSize: 17, fontWeight: 900 }}>Archive <AttuneInfo theme={theme} /></div>
            <div style={{ color: theme.muted, fontSize: 15, fontWeight: 900 }}>Show <span style={attuneSelect(theme)}>4</span> weeks</div>
          </div>
          <div style={{ marginTop: 20, color: theme.muted, fontSize: 15 }}>
            Closest to <b style={{ color: theme.brand2 }}>13 April 2026</b> and <b style={{ color: theme.brand2 }}>23 March 2026</b>.
          </div>
          <div style={{ overflow: "hidden", marginTop: 18 }}>
            <div style={{ display: "flex", gap: 14, transform: `translateX(${historyShift}px)` }}>
              {[
                ["This week", "27 Apr", 24],
                ["13 Apr", "", 21],
                ["6 Apr", "", 18],
                ["30 Mar", "", 51],
              ].map(([label, date, score], i) => (
                <AttuneHistoryCard key={String(label)} label={String(label)} date={String(date)} score={Number(score)} active={selectedPast ? i === 2 : i === 0} theme={theme} />
              ))}
            </div>
          </div>
          <AttuneWeekSnapshot selectedPast={selectedPast} theme={theme} />
        </div>
        <AttuneWeekNote frame={frame} theme={theme} />
      </div>
    </Card>
  );
}

function AttuneInfo({ theme }: { theme: Theme }) {
  return (
    <span style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-grid", placeItems: "center", fontSize: 15, fontWeight: 950, color: theme.muted, border: `1px solid ${theme.line}`, background: "rgba(17,24,39,.18)" }}>i</span>
  );
}

function AttuneProgress({ value, theme }: { value: number; theme: Theme }) {
  return (
    <div style={{ marginTop: 20, height: 14, borderRadius: 999, background: "rgba(238,243,255,.14)", border: `1px solid ${theme.line}`, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", borderRadius: 999, background: theme.brand2 }} />
    </div>
  );
}

function AttuneWeeklyStat({ label, value, text, theme }: { label: string; value: string; text: string; theme: Theme }) {
  return (
    <div style={{ borderRadius: 22, border: "1px solid rgba(127,143,207,.24)", background: "rgba(24,31,50,.58)", padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: theme.muted }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 32, lineHeight: 1, fontWeight: 950, color: theme.ink }}>{value}</div>
      <div style={{ marginTop: 8, fontSize: 13, color: theme.muted, fontWeight: 760 }}>{text}</div>
    </div>
  );
}

function AttuneHistoryCard({ label, date, score, active, theme }: { label: string; date: string; score: number; active?: boolean; theme: Theme }) {
  return (
    <div style={{ flex: "0 0 162px", borderRadius: 22, padding: 16, border: active ? `1px solid ${theme.brand2}` : `1px solid ${theme.line}`, background: active ? `linear-gradient(180deg, rgba(45,64,92,.86), ${theme.card2})` : "rgba(34,42,61,.68)", boxShadow: active ? "0 0 0 3px rgba(127,143,207,.10), 0 16px 28px rgba(6,10,24,.18)" : "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 13, color: theme.ink, fontWeight: 900 }}>{label}</div>
          {date ? <div style={{ marginTop: 3, fontSize: 12, color: theme.muted, fontWeight: 850 }}>{date}</div> : null}
        </div>
        <div style={{ fontSize: 28, fontWeight: 950, color: theme.ink }}>{score}</div>
      </div>
      <div style={{ marginTop: 10, height: 8, borderRadius: 999, background: "rgba(238,243,255,.78)", overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", borderRadius: 999, background: theme.brand2 }} />
      </div>
    </div>
  );
}

const weeklyContextNote = "Work was intense this week, so I kept things small and chose the steps I could actually finish.";

function AttuneWeekNote({ frame, theme }: { frame: number; theme: Theme }) {
  const typed = Math.floor(interpolate(frame, [850, 930], [0, weeklyContextNote.length], clamp));
  const note = weeklyContextNote.slice(0, typed);
  const cursorOpacity = Math.sin(frame * 0.34) > 0 ? 1 : 0;
  return (
    <div style={{ ...attunePanel(theme), padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: theme.muted, fontSize: 17, fontWeight: 900 }}>Week note</div>
          <div style={{ marginTop: 10, color: theme.muted, fontSize: 15, lineHeight: 1.3 }}>
            A few words about what shaped this week.
          </div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", color: theme.ink, background: "rgba(238,243,255,.20)", border: `1px solid ${theme.line}`, fontSize: 20, fontWeight: 900 }}>^</div>
      </div>
      <div
        style={{
          marginTop: 18,
          minHeight: 138,
          borderRadius: 22,
          padding: 20,
          color: theme.ink,
          fontSize: 17,
          lineHeight: 1.34,
          fontWeight: 760,
          background: "linear-gradient(180deg, rgba(31,43,61,.78), rgba(27,35,54,.92))",
          border: "1px solid rgba(127,143,207,.28)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 14px 30px rgba(6,10,24,.18)",
        }}
      >
        {note || <span style={{ color: theme.muted }}>Add context, pressure, wins, or anything else worth noting as the week unfolds.</span>}
        {typed < weeklyContextNote.length && typed > 0 ? <span style={{ opacity: cursorOpacity, color: theme.brand2 }}> |</span> : null}
      </div>
    </div>
  );
}

function AttuneWeekSnapshot({ selectedPast, theme }: { selectedPast: boolean; theme: Theme }) {
  const date = selectedPast ? "6 April 2026" : "27 April 2026";
  const momentum = selectedPast ? "18" : "24";
  const completed = selectedPast ? "2 completed" : "4 completed";
  return (
    <div style={{ marginTop: 18, borderRadius: 22, padding: 18, border: `1px solid ${theme.line}`, background: "rgba(24,31,50,.60)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 21, color: theme.ink, fontWeight: 950 }}>{date}</div>
        <div style={{ fontSize: 14, color: theme.muted }}>Momentum {momentum}/100</div>
      </div>
      <div style={{ marginTop: 10, color: theme.muted, fontSize: 15 }}>Average pace: 🔥 Brave</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 16 }}>
        <AttuneSnapshotChip icon="🗓️" text="1/7 present" theme={theme} />
        <AttuneSnapshotChip icon="✅" text={completed} theme={theme} />
      </div>
      {selectedPast ? (
        <div style={{ marginTop: 14, borderRadius: 16, padding: 15, border: `1px solid ${theme.line}`, color: theme.ink, fontSize: 16, lineHeight: 1.18, fontWeight: 880, background: "rgba(19,26,42,.42)" }}>
          <div style={{ color: theme.muted, marginBottom: 6 }}>Note</div>
          {weeklyContextNote}
        </div>
      ) : null}
    </div>
  );
}

function AttuneSnapshotChip({ icon, text, theme }: { icon: string; text: string; theme: Theme }) {
  return (
    <div style={{ height: 38, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: theme.ink, fontSize: 14, fontWeight: 900, border: `1px solid ${theme.line}`, background: "rgba(19,26,42,.42)" }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function attuneInnerCard(theme: Theme): React.CSSProperties {
  return {
    borderRadius: 28,
    padding: 24,
    background: "linear-gradient(180deg, rgba(31,43,61,.84), rgba(25,34,50,.92))",
    border: "1px solid rgba(118,145,170,.34)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)",
  };
}

function attunePanel(theme: Theme): React.CSSProperties {
  return {
    marginTop: 22,
    borderRadius: 28,
    padding: 22,
    background: "linear-gradient(180deg, rgba(31,39,60,.88), rgba(27,35,54,.92))",
    border: "1px solid rgba(145,157,190,.22)",
  };
}

function attuneSelect(theme: Theme): React.CSSProperties {
  return {
    display: "inline-grid",
    placeItems: "center",
    width: 54,
    height: 54,
    margin: "0 8px",
    borderRadius: 14,
    color: theme.ink,
    background: "rgba(27,35,54,.78)",
    border: `1px solid ${theme.line}`,
  };
}

function BottomNav({ theme, active }: { theme: Theme; active: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        bottom: 18,
        height: 72,
        borderRadius: 30,
        border: `1px solid ${theme.line}`,
        background: theme.bg === "#eef2f6" ? "rgba(255,255,255,.76)" : "rgba(15,23,23,.82)",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 8,
        padding: 8,
      }}
    >
      {["Check-in", "Pick", "My Day", "Weekly", "Profile"].map((label) => (
        <div
          key={label}
          style={{
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            fontSize: 14,
            fontWeight: 900,
            color: active === label ? "#fff" : theme.ink,
            background: active === label ? `linear-gradient(135deg, ${theme.brand}, ${theme.brand2})` : theme.card2,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function Closing({ frame, theme, line }: { frame: number; theme: Theme; line: string }) {
  const p = fade(frame, 1032, 1076);
  const y = interpolate(p, [0, 1], [30, 0], { ...clamp, easing: ease });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        opacity: p,
        transform: `translateY(${y}px)`,
        color: theme.ink,
        pointerEvents: "none",
        zIndex: 8,
      }}
    >
      <div style={{ display: "grid", justifyItems: "center" }}>
        <LogoMark size={132} />
        <div style={{ marginTop: 28, fontSize: 68, lineHeight: 1, fontWeight: 900, letterSpacing: 0 }}>Attune</div>
        <div style={{ marginTop: 18, width: 520, textAlign: "center", fontSize: 31, lineHeight: 1.16, color: theme.muted, fontWeight: 740 }}>
          {line}
        </div>
      </div>
    </div>
  );
}

function heading(theme: Theme): React.CSSProperties {
  return {
    margin: 0,
    color: theme.ink,
    fontSize: 34,
    fontWeight: 900,
    letterSpacing: 0,
    lineHeight: 1.05,
  };
}

function sub(theme: Theme): React.CSSProperties {
  return {
    marginTop: 10,
    marginBottom: 20,
    color: theme.muted,
    fontSize: 16,
    fontWeight: 700,
  };
}

function sectionTitle(theme: Theme): React.CSSProperties {
  return {
    marginTop: 22,
    marginBottom: 10,
    color: theme.muted,
    fontSize: 16,
    fontWeight: 850,
  };
}

function smallPill(theme: Theme): React.CSSProperties {
  return {
    width: 128,
    height: 54,
    borderRadius: 20,
    border: `1px solid ${theme.line}`,
    display: "grid",
    placeItems: "center",
    background: theme.card2,
    color: theme.ink,
    fontSize: 15,
    fontWeight: 850,
  };
}

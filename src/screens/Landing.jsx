import { useCallback, useEffect, useRef } from "react";
import EmojiIcon from "../components/EmojiIcon";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.attune.app";

const pickTiles = [
  "Walk around the house for 5 minutes",
  "Call or voice note someone supportive",
  "Prepare a simple snack or light meal",
  "Write down 3 small wins from today",
  "Set a 10-minute timer and do one calm task",
  "Spend 15 minutes on a hobby",
];

const moodOptions = [
  { label: "Worn out", icon: "low-battery", tone: "tough" },
  { label: "Tired", icon: "sleeping-face", tone: "tough" },
  { label: "Overwhelmed", icon: "face-with-spiral-eyes", tone: "tough" },
  { label: "Irritable", icon: "persevering-face", tone: "tough" },
  { label: "Restless", icon: "high-voltage", tone: "tough" },
  { label: "Tender", icon: "bubbles", tone: "okay" },
  { label: "Okay", icon: "slightly-smiling-face", tone: "okay", active: true },
  { label: "Settled", icon: "relieved-face", tone: "good" },
  { label: "Hopeful", icon: "sun-behind-cloud", tone: "good", active: true },
  { label: "Motivated", icon: "sparkles", tone: "good" },
];

const energyOptions = [
  { label: "Very low", hint: "Depleted", tone: "soft" },
  { label: "Low", hint: "Drained", tone: "low" },
  { label: "Okay", hint: "Steady", tone: "okay", active: true },
  { label: "High", hint: "Charged", tone: "high" },
];

const bodyOptions = [
  { label: "Tender", hint: "Sensitive", tone: "soft" },
  { label: "Sore", hint: "Achey", tone: "low" },
  { label: "Manageable", hint: "Holding okay", tone: "okay", active: true },
  { label: "Great", hint: "Feeling strong", tone: "high" },
];

const paceOptions = [
  { label: "Rest", icon: "bed" },
  { label: "Gentle", icon: "leaf-fluttering-in-wind" },
  { label: "Light", icon: "person-walking" },
  { label: "Steady", icon: "compass" },
  { label: "Capable", icon: "water-wave", active: true },
  { label: "Brave", icon: "fire" },
];

function LogoMark({ size = "md" }) {
  return <span className={`landingLogoMark landingLogoMark-${size}`} aria-hidden="true" />;
}

function AppHeader({ dark = false }) {
  return (
    <div className="landingAppHeader">
      <LogoMark />
      <div>
        <div className="landingAppTitleRow">
          <strong>Attune</strong>
          <span>Plus</span>
        </div>
        <p>Meet yourself where you are, then take one small step toward better.</p>
      </div>
      {dark ? <div className="landingHeaderGlow" aria-hidden="true" /> : null}
    </div>
  );
}

function CheckInMock() {
  return (
    <div className="landingActualAppPreview">
      <div className="landingActualTop">
        <div className="brand">
          <div className="brandMark" aria-hidden="true"></div>
          <div className="brandText">
            <div className="brandTitleRow">
              <h1>Attune</h1>
              <span className="planTag">Plus</span>
            </div>
            <div className="tag">Meet yourself where you are, then take one small step toward better.</div>
          </div>
        </div>
      </div>
      <div className="card checkinCard landingStaticCheckinCard">
        <div className="checkinIntro">
          <h2 className="checkinHeading compact">How are you feeling, Brooklyn?</h2>
        </div>

        <div className="checkinFlow">
          <div className="checkinStep checkinStepMood" data-step="mood">
            <label>Mood (pick up to 2)</label>
            <div className="moodGrid" role="group" aria-label="Mood">
              {moodOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={"moodBtn" + (option.active ? " active" : "")}
                  data-mood-label={option.label}
                  data-tone={option.tone}
                  aria-pressed={option.active ? "true" : "false"}
                  tabIndex={-1}
                >
                  <span className="moodCheck" aria-hidden="true" />
                  <span className="moodEmoji" aria-hidden="true">
                    <EmojiIcon id={option.icon} size="var(--moodEmojiSize)" />
                  </span>
                  <span className="moodLabel">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="checkinStep" data-step="energy">
            <label>Energy</label>
            <div className="choicePillGrid" data-columns="4" role="group" aria-label="Energy">
              {energyOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={"choicePill" + (option.active ? " active" : "")}
                  data-tone={option.tone}
                  aria-pressed={option.active ? "true" : "false"}
                  tabIndex={-1}
                >
                  <span className="choicePillText">
                    <span className="choicePillLabel">{option.label}</span>
                    <span className="choicePillHint">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="checkinStep" data-step="body">
            <label>Body</label>
            <div className="choicePillGrid" data-columns="2" role="group" aria-label="Body">
              {bodyOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={"choicePill" + (option.active ? " active" : "")}
                  data-tone={option.tone}
                  aria-pressed={option.active ? "true" : "false"}
                  tabIndex={-1}
                >
                  <span className="choicePillText">
                    <span className="choicePillLabel">{option.label}</span>
                    <span className="choicePillHint">{option.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="checkinStep checkinPaceStep" data-step="pace">
            <div className="checkinPaceHead">
              <label>
                Pace for today
                <span className="checkinPaceHint">(defaulted, but adjustable)</span>
              </label>
            </div>
            <div className="pillrow" role="group" aria-label="Pace">
              {paceOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={"pill" + (option.active ? " active" : "")}
                  tabIndex={-1}
                >
                  <span className="pillIcon" aria-hidden="true">
                    <EmojiIcon id={option.icon} size="var(--pillEmojiSize)" className="pillEmoji" />
                  </span>
                  <span className="pillLabel">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="checkinStep" data-step="note">
            <div className="checkinNoteBlock checkinNoteBlockCollapsible">
              <div className="checkinNoteHead checkinNoteHeadCollapsible">
                <div className="checkinNoteLead">
                  <div className="checkinNoteTitleRow">
                    <span className="checkinNoteTitle">Optional note</span>
                    <span className="landingInfoDot" aria-hidden="true">i</span>
                  </div>
                </div>
                <span className="checkinNoteMeta">
                  <span className="checkinNoteChevron" aria-hidden="true"></span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="landingPreviewBottomNav" aria-hidden="true">
        <span className="active">Check-in</span>
        <span>Pick</span>
        <span>My Day</span>
        <span>Weekly</span>
        <span>Profile</span>
      </div>
    </div>
  );
}

function MockBottomNav({ active }) {
  return (
    <div className="landingMockBottomNav" aria-hidden="true">
      {["Check-in", "Pick", "My Day", "Weekly", "Profile"].map((item) => (
        <span className={item === active ? "active" : ""} key={item}>{item}</span>
      ))}
    </div>
  );
}

function PickMock() {
  return (
    <div className="landingAppScreen landingAppScreenDark">
      <AppHeader dark />
      <div className="landingMockPanel">
        <h3>Pick an activity</h3>
        <p className="landingMockSub">Personalized from your check-in.</p>
        <div className="landingMockTopline">
          <h4>What feels right?</h4>
          <span>3 suggested</span>
        </div>
        <div className="landingBoardGrid">
          {pickTiles.map((tile, index) => (
            <div className={index < 3 ? "isSuggested" : ""} key={tile}>
              {index < 3 ? <span /> : null}
              <strong>{tile}</strong>
            </div>
          ))}
        </div>
      </div>
      <MockBottomNav active="Pick" />
    </div>
  );
}

function DayMock() {
  return (
    <div className="landingAppScreen landingAppScreenDark landingDayMock">
      <AppHeader dark />
      <div className="landingMockPanel">
        <h3>My Day</h3>
        <p className="landingMockSub">Aim for 2-5 tasks. You can add up to 10 if you'd like.</p>
        <div className="landingNoteCard">
          <span>Personal note</span>
          <strong>Take a Small Step Forward</strong>
          <p>Keep today manageable. Each little action brings you closer to your goals.</p>
        </div>
        {["Prepare a simple snack or light meal", "Write down 3 small wins from today", "Try a beginner yoga/stretch video"].map((task, index) => (
          <div className={`landingTaskRow ${index !== 1 ? "isDone" : ""}`} key={task}>
            <span>{index !== 1 ? "✓" : ""}</span>
            <strong>{task}</strong>
          </div>
        ))}
      </div>
      <MockBottomNav active="My Day" />
    </div>
  );
}

function WeeklyMock() {
  return (
    <div className="landingWeeklyMock">
      <div className="landingWeeklyCard">
        <span className="landingEyebrow">This week's shape</span>
        <div className="landingWeeklyHead">
          <strong>Starting</strong>
          <span>Momentum 24/100</span>
        </div>
        <p>Something has started to move. A few returns are already shaping the week.</p>
        <div className="landingProgress"><span /></div>
        <div className="landingWeeklyStats">
          <div><strong>1/7</strong><span>day checked in</span></div>
          <div><strong>4</strong><span>tasks finished</span></div>
        </div>
      </div>
      <div className="landingWeeklyCard landingWeekNote">
        <span className="landingEyebrow">Week note</span>
        <p>Work was intense this week, so I kept things small and chose the steps I could actually finish.</p>
      </div>
    </div>
  );
}

function PhoneFrame({ children, className = "" }) {
  return (
    <div className={`landingPhone ${className}`}>
      <div className="landingPhoneBar" />
      <div className="landingPhoneScreen">{children}</div>
    </div>
  );
}

function StepItem({ number, title, body }) {
  return (
    <div className="landingStep">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function FeatureItem({ title, body }) {
  return (
    <div className="landingFeatureItem">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

export default function Landing() {
  const landingPageRef = useRef(null);

  const scrollToHash = useCallback((id, behavior = "smooth") => {
    const scroller = landingPageRef.current;
    const target = document.getElementById(id);
    if (!scroller || !target) return;

    const scrollerBox = scroller.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const top = targetBox.top - scrollerBox.top + scroller.scrollTop;

    scroller.scrollTo({ top, behavior });
  }, []);

  const scrollToCurrentHash = useCallback((behavior = "auto") => {
    const id = window.location.hash.replace("#", "");
    if (!id) return;

    window.requestAnimationFrame(() => scrollToHash(id, behavior));
  }, [scrollToHash]);

  const handleHashClick = useCallback((event, id) => {
    event.preventDefault();
    if (window.location.hash !== `#${id}`) {
      window.history.pushState(null, "", `#${id}`);
    }
    scrollToHash(id, "smooth");
  }, [scrollToHash]);

  useEffect(() => {
    scrollToCurrentHash("auto");
    const onHashChange = () => scrollToCurrentHash("smooth");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [scrollToCurrentHash]);

  return (
    <div className="landingPage" ref={landingPageRef}>
      <header className="landingNav" aria-label="Attune landing navigation">
        <a className="landingBrand" href="/landing" aria-label="Attune landing page">
          <LogoMark />
          <span>Attune</span>
        </a>
        <nav>
          <a href="#how" onClick={(event) => handleHashClick(event, "how")}>How it works</a>
          <a href="#plus" onClick={(event) => handleHashClick(event, "plus")}>Plus</a>
          <a className="landingNavCta" href={PLAY_STORE_URL}>Download</a>
        </nav>
      </header>

      <main>
        <section className="landingHero">
          <div className="landingHeroCopy">
            <div className="landingHeroKicker">
              Built for the day you are actually having
            </div>
            <h1>Attune</h1>
            <p className="landingHeroLine">Meet yourself where you are.</p>
            <p className="landingHeroBody">
              Check in with how you feel, choose one small realistic step, and build a rhythm you can actually keep.
            </p>
            <div className="landingHeroProof" aria-label="Attune flow">
              <span>Check in</span>
              <span>Pick one step</span>
              <span>Notice the week</span>
            </div>
            <div className="landingHeroActions">
              <a className="landingButton landingButtonPrimary" href={PLAY_STORE_URL}>Download Attune</a>
              <a className="landingButton landingButtonSecondary" href="#how" onClick={(event) => handleHashClick(event, "how")}>See how it works</a>
            </div>
          </div>

          <div className="landingHeroVisual" aria-label="Attune app preview">
            <PhoneFrame className="landingHeroPhone">
              <CheckInMock />
            </PhoneFrame>
          </div>
        </section>

        <section className="landingSection landingHow" id="how">
          <div className="landingSectionHeader">
            <span className="landingEyebrow">How Attune works</span>
            <h2>A calmer loop for showing up.</h2>
            <p>Attune keeps the path small on purpose: notice what is true, choose one doable step, then let the week show you what helped.</p>
          </div>
          <div className="landingSteps">
            <StepItem number="1" title="Check in" body="Name your mood, energy, body, and pace without turning it into a whole project." />
            <StepItem number="2" title="Pick one small step" body="Choose from realistic options that fit the state you are in today." />
            <StepItem number="3" title="Notice your rhythm" body="See what you completed, where the week felt easier, and what was happening around it." />
          </div>
          <div className="landingFlowLine" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </section>

        <section className="landingShowcase">
          <div className="landingShowcaseCopy">
            <span className="landingEyebrow">Small steps, better matched</span>
            <h2>Not another list you have to conquer.</h2>
            <p>
              Attune helps you pick something that fits your actual capacity. Rest days, gentle days, capable days, and brave days all belong.
            </p>
          </div>
          <div className="landingShowcaseStage">
            <div className="landingProductNote landingProductNoteLeft">
              <strong>After check-in</strong>
              <span>Attune points to a few options that fit the day.</span>
            </div>
            <div className="landingProductNote landingProductNoteRight">
              <strong>Then My Day stays light</strong>
              <span>Keep what helps, remove what does not.</span>
            </div>
            <div className="landingPhoneRail">
              <PhoneFrame><PickMock /></PhoneFrame>
              <PhoneFrame className="landingPhoneOffset"><DayMock /></PhoneFrame>
            </div>
          </div>
        </section>

        <section className="landingSection landingFeatures">
          <div className="landingSectionHeader">
            <span className="landingEyebrow">What people feel in the app</span>
            <h2>Enough structure to help. Enough softness to stay with it.</h2>
          </div>
          <div className="landingFeatureGrid">
            <FeatureItem title="Check-ins with texture" body="Mood, energy, body, and pace give Attune enough context to suggest steps that feel realistic." />
            <FeatureItem title="AI-assisted suggestions" body="Plus users can get a board shaped by today’s check-in, including optional note context when they allow it." />
            <FeatureItem title="My Day without pressure" body="Keep a short list of doable steps, remove what does not fit, and check off what you actually finish." />
            <FeatureItem title="A weekly rhythm" body="Weekly summaries, history, and notes help users remember the shape of life around the numbers." />
          </div>
        </section>

        <section className="landingStory">
          <div>
            <span className="landingEyebrow">The emotional point</span>
            <h2>Choose for the day you have, not the day you wish you had.</h2>
            <p>
              Some days the best step is brave. Some days it is gentle. Attune gives people a way to keep moving without pretending they have more capacity than they do.
            </p>
          </div>
          <WeeklyMock />
        </section>

        <section className="landingPlus" id="plus">
          <div className="landingPlusCopy">
            <span className="landingEyebrow">Attune Plus</span>
            <h2>More personal, still low-pressure.</h2>
            <p>
              Plus adds smarter boards, note memory, exports, and richer weekly insight. It is there to make Attune more useful, not more demanding.
            </p>
            <div className="landingPlusTrust">
              <span>No pressure streaks</span>
              <span>No fake cure claims</span>
              <span>Built around capacity</span>
            </div>
          </div>
          <div className="landingPlusList">
            <div><strong>Smarter picking</strong><span>Suggestions adapt to your check-in and what you complete or skip.</span></div>
            <div><strong>Note memory</strong><span>Optional context helps Attune remember what was shaping your week.</span></div>
            <div><strong>Weekly insight</strong><span>Patterns and history make progress easier to notice over time.</span></div>
          </div>
        </section>

        <section className="landingFinal" id="download">
          <div className="landingFinalPanel">
            <LogoMark size="lg" />
            <span className="landingEyebrow">Start small</span>
            <h2>Attune</h2>
            <p>One small step toward better.</p>
            <a className="landingButton landingButtonPrimary" href={PLAY_STORE_URL}>Download Attune</a>
          </div>
        </section>
      </main>
    </div>
  );
}

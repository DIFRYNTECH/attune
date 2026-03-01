import lowBatteryUrl from "fluentui-emoji/icons/modern/low-battery.svg?url";
import sleepingFaceUrl from "fluentui-emoji/icons/modern/sleeping-face.svg?url";
import spiralEyesUrl from "fluentui-emoji/icons/modern/face-with-spiral-eyes.svg?url";
import perseveringFaceUrl from "fluentui-emoji/icons/modern/persevering-face.svg?url";
import highVoltageUrl from "fluentui-emoji/icons/modern/high-voltage.svg?url";
import bubblesUrl from "fluentui-emoji/icons/modern/bubbles.svg?url";
import slightlySmilingUrl from "fluentui-emoji/icons/modern/slightly-smiling-face.svg?url";
import relievedFaceUrl from "fluentui-emoji/icons/modern/relieved-face.svg?url";
import sunBehindCloudUrl from "fluentui-emoji/icons/modern/sun-behind-cloud.svg?url";
import sparklesUrl from "fluentui-emoji/icons/modern/sparkles.svg?url";

import bedUrl from "fluentui-emoji/icons/modern/bed.svg?url";
import leafFlutteringUrl from "fluentui-emoji/icons/modern/leaf-fluttering-in-wind.svg?url";
import footprintsUrl from "fluentui-emoji/icons/modern/footprints.svg?url";
import personWalkingUrl from "fluentui-emoji/icons/modern/person-walking-default.svg?url";
import compassUrl from "fluentui-emoji/icons/modern/compass.svg?url";
import waterWaveUrl from "fluentui-emoji/icons/modern/water-wave.svg?url";
import fireUrl from "fluentui-emoji/icons/modern/fire.svg?url";

export const EMOJI_ASSETS = {
  // Mood
  "low-battery": lowBatteryUrl,
  "sleeping-face": sleepingFaceUrl,
  "face-with-spiral-eyes": spiralEyesUrl,
  "persevering-face": perseveringFaceUrl,
  "high-voltage": highVoltageUrl,
  bubbles: bubblesUrl,
  "slightly-smiling-face": slightlySmilingUrl,
  "relieved-face": relievedFaceUrl,
  "sun-behind-cloud": sunBehindCloudUrl,
  sparkles: sparklesUrl,

  // Pace
  bed: bedUrl,
  "leaf-fluttering-in-wind": leafFlutteringUrl,
  footprints: footprintsUrl,
  "person-walking": personWalkingUrl,
  compass: compassUrl,
  "water-wave": waterWaveUrl,
  fire: fireUrl,
};

export function emojiAssetUrl(id) {
  return id ? EMOJI_ASSETS[id] : undefined;
}

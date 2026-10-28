import {Layout, Txt, makeScene2D} from '@motion-canvas/2d';
import {waitFor} from '@motion-canvas/core';
import {captionAt} from '../../../src/narration/timeline';
import p from '../../../config/presentation.json';
import episode from '../episode.json';
import timeline from '../assets/timeline.json';

export default makeScene2D(function* (view) {
  view.fill(p.colors.background);
  view.add(
    <Layout size={[episode.output.width, episode.output.height]} fontFamily={p.fontFamily}
      fontWeight={p.fontWeight}>
      <Layout scale={Math.min(episode.output.width / p.canvas.width, episode.output.height / p.canvas.height)}>
        <Layout>
          {/* Author the episode's visual performance here. Objects may persist across audio segments. */}
        </Layout>
        {/* Screen-space captions stay independent of the content world's camera transforms. */}
        <Txt text={() => captionAt(timeline.captions, view.globalTime())}
          y={p.subtitle.y} width={p.subtitle.width} fontSize={p.subtitle.fontSize}
          lineHeight={p.subtitle.lineHeight} fill={p.colors.ink} stroke={p.colors.background}
          lineWidth={p.subtitle.outlineWidth} strokeFirst textAlign="center" />
      </Layout>
    </Layout>,
  );
  // Actual episode content and audio-derived timing are authored per episode.
  yield* waitFor(timeline.durationSeconds);
});

import {Img, Rect, makeScene2D} from '@motion-canvas/2d';
import {waitFor} from '@motion-canvas/core';
import design from '../design.json';
import episode from '../episode.json';

export default makeScene2D(function* (view) {
  const count = design.columns * design.rows;
  const frame = () => Math.min(count - 1, Math.floor(view.globalTime() * design.framesPerSecond));
  const column = () => frame() % design.columns;
  const row = () => Math.floor(frame() / design.columns);
  const cellWidth = episode.output.width;
  const cellHeight = episode.output.height;
  view.fill(design.background);
  view.add(
    <Rect width={cellWidth} height={cellHeight} clip>
      <Img src="/images/naiwa-reference/sprite-sheet.png"
        width={cellWidth * design.columns} height={cellHeight * design.rows}
        x={() => ((design.columns - 1) / 2 - column()) * cellWidth}
        y={() => ((design.rows - 1) / 2 - row()) * cellHeight} />
    </Rect>,
  );
  yield* waitFor(episode.output.targetSeconds);
});

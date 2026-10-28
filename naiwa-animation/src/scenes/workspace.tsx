import {makeScene2D} from '@motion-canvas/2d';
import {waitUntil} from '@motion-canvas/core';
import presentation from '../../config/presentation.json';

// Empty workspace, not an episode or a test animation.
export default makeScene2D(function* (view) {
  view.fontFamily(presentation.fontFamily);
  view.fill(presentation.colors.background);
  yield* waitUntil('end');
});

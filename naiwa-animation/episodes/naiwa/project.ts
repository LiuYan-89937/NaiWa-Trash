import {makeProject} from '@motion-canvas/core';
import main from './scenes/main?scene';
import timeline from './assets/timeline.json';

// prepare:episode binds the requested audio; a silent project has no audio property.
export default makeProject({scenes: [main], ...(timeline.audio ? {audio: timeline.audio} : {})});

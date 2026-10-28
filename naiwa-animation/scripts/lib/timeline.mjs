/** Match the provider's timed text to the authored text without fuzzy repair. */
function alignWords(segment) {
  const characters = Array.from(segment.text);
  const significant = characters.flatMap((character, index) =>
    /\s/u.test(character) ? [] : [{character: character.toLocaleLowerCase(), index}],
  );
  const timedCharacters = new Array(characters.length);
  let cursor = 0;
  for (const sentence of segment.sentences) {
    for (const word of sentence.words) {
      for (const character of Array.from(word.text)) {
        if (/\s/u.test(character)) continue;
        const expected = significant[cursor++];
        if (!expected || character.toLocaleLowerCase() !== expected.character) {
          throw new Error('字级时间戳与原稿不一致：' + segment.id + '。需要人工核对，不能估算字幕时间。');
        }
        timedCharacters[expected.index] = {
          start: segment.startSeconds + word.begin_time / 1000,
          end: segment.startSeconds + word.end_time / 1000,
        };
      }
    }
  }
  if (cursor !== significant.length) throw new Error('时间戳未覆盖完整原稿：' + segment.id);
  return {characters, timedCharacters};
}

function wrapCaption(characters, limit) {
  const lines = [];
  for (let cursor = 0; cursor < characters.length;) {
    const remaining = characters.length - cursor;
    let length = Math.min(limit, remaining);
    if (remaining > limit) {
      const punctuation = characters.slice(cursor, cursor + length).findLastIndex(c => /[，、：；]/u.test(c));
      if (punctuation >= length / 2) length = punctuation + 1;
    }
    lines.push(characters.slice(cursor, cursor + length).join(''));
    cursor += length;
  }
  return lines.join('\n');
}

export function compileTimeline(timing, storyboard, presentation, targetSeconds) {
  if (timing.durationSeconds > targetSeconds) throw new Error('旁白长于目标时长；请先调整本期时长或原稿。');
  if (storyboard.chapters.length !== timing.segments.length) throw new Error('分镜与旁白段数不一致。');
  const captions = [];
  const chapters = timing.segments.map((segment, index) => {
    const chapter = storyboard.chapters[index];
    if (chapter.id !== segment.id) throw new Error('分镜与旁白顺序不一致：' + segment.id);
    const {characters, timedCharacters} = alignWords(segment);
    const cues = Object.fromEntries(Object.entries(chapter.cues).map(([name, phrase]) => {
      const location = segment.text.indexOf(phrase);
      if (location < 0 || segment.text.indexOf(phrase, location + phrase.length) >= 0) {
        throw new Error('分镜提示词必须在本段原稿中唯一：' + segment.id + '/' + name);
      }
      const charIndex = Array.from(segment.text.slice(0, location)).length;
      const time = timedCharacters[charIndex]?.start;
      if (time === undefined) throw new Error('分镜提示词没有真实时间戳：' + segment.id + '/' + name);
      return [name, time];
    }));
    for (let cursor = 0; cursor < characters.length;) {
      const available = Math.min(presentation.subtitleCharacters, characters.length - cursor);
      const window = characters.slice(cursor, cursor + available);
      const fullStop = window.findIndex(c => /[。！？；]/u.test(c));
      const comma = window.findLastIndex(c => /[，、：]/u.test(c));
      const count = fullStop >= 0 ? fullStop + 1 : comma >= available / 2 ? comma + 1 : available;
      const text = characters.slice(cursor, cursor + count);
      const stamps = timedCharacters.slice(cursor, cursor + count).filter(Boolean);
      if (!stamps.length) throw new Error('字幕缺少时间戳：' + segment.id);
      captions.push({
        text: wrapCaption(text, presentation.captionLineCharacters),
        start: stamps[0].start,
        end: stamps.at(-1).end,
        segmentId: segment.id,
      });
      cursor += count;
    }
    return {
      id: segment.id,
      start: segment.startSeconds,
      end: timing.segments[index + 1]?.startSeconds ?? targetSeconds,
      cues,
    };
  });
  // Hold each actual subtitle until the next spoken phrase in the same segment.
  for (let index = 0; index < captions.length; index++) {
    const next = captions[index + 1];
    if (next?.segmentId === captions[index].segmentId) captions[index].end = next.start;
  }
  return {audio: timing.audio, durationSeconds: targetSeconds, captions, chapters};
}

function srtTime(seconds) {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const secs = Math.floor(milliseconds / 1000) % 60;
  const fraction = milliseconds % 1000;
  return [hours, minutes, secs].map(n => String(n).padStart(2, '0')).join(':') + ',' + String(fraction).padStart(3, '0');
}

export function serializeSrt(captions) {
  return captions.map((caption, index) =>
    `${index + 1}\n${srtTime(caption.start)} --> ${srtTime(caption.end)}\n${caption.text}\n`,
  ).join('\n');
}

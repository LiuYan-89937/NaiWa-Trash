/** Audio segment timing; not a scene boundary or an object's lifetime. */
export interface ChapterTiming {
  id: string;
  start: number;
  end: number;
  cues: Record<string, number>;
}

export interface Caption {
  text: string;
  start: number;
  end: number;
}

export function captionAt(captions: Caption[], time: number): string {
  const index = captions.findIndex(caption => caption.start <= time && time < caption.end);
  return index < 0 ? '' : captions[index].text;
}
